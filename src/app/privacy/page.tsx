import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

export default function PrivacyPolicyPage() {
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
              <h1 className="legal-page-title">Privacy Policy</h1>
            </div>
          </section>
          
          <section className="legal-content">
            <div className="legal-container">
              <h2>Information We Collect</h2>
              <p>We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, postal address, profile picture, payment method, items requested (for delivery services), and other information you choose to provide.</p>
              
              <h2>Use of Information</h2>
              <p>We may use the information we collect about you to provide, maintain, and improve our services, including, for example, to facilitate payments, send receipts, provide products and services you request (and send related information), develop new features, provide customer support to Users, develop safety features, authenticate users, and send product updates and administrative messages.</p>
              
              <h2>Sharing of Information</h2>
              <p>We may share the information we collect about you as described in this Statement or as described at the time of collection or sharing, including as follows: with third party Service Providers; in response to a request for information by a competent authority if we believe disclosure is in accordance with, or is otherwise required by, any applicable law, regulation, or legal process.</p>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
