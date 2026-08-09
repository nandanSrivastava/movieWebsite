/**
 * CineBook Concurrency & Race-Condition Tester
 * 
 * Dynamically queries active showtimes, selects an available seat,
 * and launches parallel requests attempting to lock it simultaneously.
 * Verifies that PostgreSQL FOR UPDATE NOWAIT (or Mock atomic checks)
 * grants the lock to exactly ONE client and rejects all others with 409.
 */

const http = require('http');

const PORT = 3000;
const HOST = 'localhost';
const CONCURRENT_CLIENTS = 5;

// Helper to make GET requests
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse JSON response from ${path}`));
        }
      });
    }).on('error', reject);
  });
}

function makeRequest(showId, seatLayoutId, clientId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      showId: showId,
      seatLayoutIds: [seatLayoutId]
    });

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/seats/lock',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        // Mock session cookie to bypass login check in mock mode
        'Cookie': `cinebook_mock_session=${JSON.stringify({ id: `usr-client-${clientId}`, role: 'user' })}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          clientId,
          status: res.statusCode,
          body: JSON.parse(body)
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        clientId,
        status: 500,
        body: { error: err.message }
      });
    });

    req.write(data);
    req.end();
  });
}

function unlockSeat(showId, seatLayoutId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      showId: showId,
      seatLayoutIds: [seatLayoutId]
    });

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/seats/unlock',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Cookie': `cinebook_mock_session=${JSON.stringify({ id: 'usr-client-1', role: 'admin' })}`
      }
    };

    const req = http.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

async function runTest() {
  console.log('====================================================');
  console.log('  CineBook Booking Platform: Concurrency Stress Test');
  console.log('====================================================');

  try {
    // 1. Discover active showtimes
    console.log('Querying active scheduled showtimes...');
    const showsData = await httpGet('/api/shows');
    const showsList = showsData.shows || [];
    if (showsList.length === 0) {
      console.log('❌ Error: No active scheduled showtimes found to perform testing.');
      process.exit(1);
    }

    const targetShow = showsList[0];
    console.log(`Found active show: "${targetShow.movie?.title}" (ID: ${targetShow.id})`);

    // 2. Discover available seats for this showtime
    console.log(`Querying seating layouts for show ${targetShow.id}...`);
    const seatsData = await httpGet(`/api/seats/status?showId=${targetShow.id}`);
    const seatsList = seatsData.seats || [];
    
    // Find an available seat
    const availableSeat = seatsList.find(s => s.status === 'available');
    if (!availableSeat) {
      console.log('❌ Error: No available seats found for testing in this showtime.');
      process.exit(1);
    }

    const seatLayoutId = availableSeat.seat_layout_id;
    const seatLabel = `${availableSeat.seat_layout?.row_label}-${availableSeat.seat_layout?.seat_number}`;
    console.log(`Targeting seat lock on available seat: "${seatLabel}" (Layout ID: ${seatLayoutId})`);

    // 3. Reset seat status just in case
    console.log(`Ensuring seat is completely unlocked...`);
    await unlockSeat(targetShow.id, seatLayoutId);

    // 4. Launch concurrent requests
    console.log(`Spawning ${CONCURRENT_CLIENTS} concurrent requests attempting to lock seat '${seatLabel}' simultaneously...`);
    console.log('----------------------------------------------------');

    const promises = [];
    for (let i = 1; i <= CONCURRENT_CLIENTS; i++) {
      promises.push(makeRequest(targetShow.id, seatLayoutId, i));
    }

    const results = await Promise.all(promises);

    let successCount = 0;
    let conflictCount = 0;
    let otherCount = 0;

    results.forEach((res) => {
      if (res.status === 200) {
        successCount++;
        console.log(`🟢 Client #${res.clientId}: LOCK SUCCESS (HTTP 200)`);
      } else if (res.status === 409) {
        conflictCount++;
        console.log(`🔴 Client #${res.clientId}: CONFLICT REJECTED (HTTP 409) - Msg: "${res.body.error}"`);
      } else {
        otherCount++;
        console.log(`⚠️ Client #${res.clientId}: OTHER ERROR (HTTP ${res.status}) - Msg: "${res.body.error || JSON.stringify(res.body)}"`);
      }
    });

    console.log('----------------------------------------------------');
    console.log('Test Summary:');
    console.log(`- Success locks count: ${successCount}`);
    console.log(`- Conflicting locks rejected count: ${conflictCount}`);
    console.log(`- Unexpected failures count: ${otherCount}`);
    console.log('----------------------------------------------------');

    if (successCount === 1 && conflictCount === CONCURRENT_CLIENTS - 1) {
      console.log('✅ TEST PASSED: Concurrency locks are correctly isolated. Database atomic NOWAIT guards held successfully!');
    } else {
      console.log('❌ TEST FAILED: Race condition detected. Ensure PostgreSQL transactions or memory locks are correctly blocking parallel threads.');
    }
    console.log('====================================================');
    
    // Clean up seat lock after test
    await unlockSeat(targetShow.id, seatLayoutId);

  } catch (err) {
    console.error('❌ Stress test execution failed:', err.message);
  }
}

// Check if Next.js dev server is running before executing
http.get(`http://${HOST}:${PORT}/`, (res) => {
  res.resume();
  runTest();
}).on('error', () => {
  console.log(`[Error] Next.js dev server is not running on http://${HOST}:${PORT}. Please start it first.`);
  process.exit(1);
});
