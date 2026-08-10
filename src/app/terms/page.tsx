import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

export default function TermsPage() {
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
              <h1 className="legal-page-title">Terms of Use</h1>
            </div>
          </section>
          
          <section className="legal-content">
            <div className="legal-container">
              <h2>Acceptance of Terms</h2>
              <p>By accessing or using the Dhrub Cineplex website and services, you agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree to these terms, please do not use our services.</p>
              
              <h2>Use of Services</h2>
              <p>You agree to use our services only for lawful purposes and in accordance with these Terms. You are responsible for maintaining the confidentiality of your account information and for all activities that occur under your account.</p>
              
              <h2>Ticketing and Modifications</h2>
              <p>All tickets are subject to availability. We reserve the right to modify or discontinue any part of the service, including showtimes and pricing, without prior notice. Dhrub Cineplex is not liable for any changes or cancellations to the schedule.</p>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
