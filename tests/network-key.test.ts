import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { networkKey } from '../src/lib/requestAuth';

describe('networkKey (rate limits and seat caps per network)', () => {
  it('keeps IPv4 addresses as they are', () => {
    expect(networkKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('unwraps IPv4-mapped IPv6', () => {
    expect(networkKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('groups every address in one IPv6 /64 together', () => {
    const a = networkKey('2001:db8:2:2::1');
    expect(a).toBe('2001:db8:2:2::/64');
    expect(networkKey('2001:0db8:0002:0002:ffff:1:2:3')).toBe(a);
    expect(networkKey('2001:db8:2:2:abcd::99')).toBe(a);
  });

  it('keeps different /64s apart', () => {
    expect(networkKey('2001:db8:2:3::1')).not.toBe(networkKey('2001:db8:2:2::1'));
  });

  it('handles compressed prefixes and zone ids', () => {
    expect(networkKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(networkKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
});
