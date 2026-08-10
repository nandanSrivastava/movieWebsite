import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

export default function RefundPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        .legal-page-header {
          padding: 160px 0 80px;
          text-align: center;
          background: linear-gradient(to bottom, var(--bg-void), var(--bg-primary));
        }
        .legal-page-title {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 4.5rem);
          color: #fff;
          margin-bottom: 16px;
        }
        .legal-content {
          padding: 0 0 120px;
          background: var(--bg-primary);
        }
        .legal-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 0 20px;
          color: rgba(255,255,255,0.7);
          font-family: var(--font-body);
          line-height: 1.8;
        }
        .legal-container h2 {
          color: var(--gold-500);
          font-family: var(--font-heading);
          margin-top: 40px;
          margin-bottom: 20px;
        }
      `}} />
      <div className="bg-void min-h-screen">
        <Header />
        <main>
          <section className="legal-page-header">
            <div className="container">
              <h1 className="legal-page-title">Refund Policy</h1>
            </div>
          </section>
          
          <section className="legal-content">
            <div className="legal-container">
              <h2>Cancellation & Refund</h2>
              <p>Tickets once purchased are generally non-refundable. However, in the event of a show cancellation by Dhrub Cineplex, a full refund will be initiated to the original payment method within 5-7 business days.</p>
              
              <h2>Modifications to Booking</h2>
              <p>Exchanges or rescheduling of tickets may be allowed at the sole discretion of the management, subject to availability and provided the request is made at least 2 hours before the scheduled showtime.</p>
              
              <h2>Food and Beverages</h2>
              <p>All online food and beverage orders are final and non-refundable once the order preparation has started. In case of issues, please contact our on-site management.</p>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
