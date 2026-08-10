import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';

export default function MenuPage() {
  const menuCategories = [
    {
      title: "Gourmet Popcorn",
      items: [
        { name: "Classic Salted", price: "₹250", desc: "Premium kernels popped to perfection." },
        { name: "Caramel Crunch", price: "₹300", desc: "Coated in our signature buttery caramel." },
        { name: "Cheese Blast", price: "₹320", desc: "Tossed with rich cheddar cheese." },
        { name: "Half & Half", price: "₹350", desc: "Mix any two flavors of your choice." },
      ]
    },
    {
      title: "Handcrafted Beverages",
      items: [
        { name: "Iced Latte", price: "₹180", desc: "Cold espresso with milk and ice." },
        { name: "Fresh Lime Soda", price: "₹120", desc: "Refreshing lime soda, sweet or salted." },
        { name: "Berry Mojito", price: "₹220", desc: "Mixed berries with mint and sparkling water." },
        { name: "Cold Coffee", price: "₹200", desc: "Creamy blended cold coffee." },
      ]
    },
    {
      title: "Savory Delights",
      items: [
        { name: "Paneer Tikka Wrap", price: "₹280", desc: "Spiced paneer wrapped in a warm tortilla." },
        { name: "Nachos with Salsa", price: "₹260", desc: "Crispy tortilla chips with tangy salsa." },
        { name: "Cheese Corn Nuggets", price: "₹240", desc: "Golden fried nuggets with a cheesy center." },
        { name: "Loaded Fries", price: "₹250", desc: "French fries topped with cheese and jalapeños." },
      ]
    }
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        .menu-page-header {
          padding: 160px 0 80px;
          text-align: center;
          background: linear-gradient(to bottom, var(--bg-void), var(--bg-primary));
        }
        .menu-page-title {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 4.5rem);
          color: #fff;
          margin-bottom: 16px;
        }
        .menu-page-subtitle {
          color: var(--gold-500);
          font-family: var(--font-heading);
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }
        
        .menu-section {
          padding: 0 0 120px;
          background: var(--bg-primary);
        }

        .menu-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .menu-category {
          margin-bottom: 60px;
        }

        .menu-category-title {
          font-family: var(--font-display);
          font-size: 2rem;
          color: var(--gold-500);
          margin-bottom: 30px;
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          padding-bottom: 10px;
        }

        .menu-grid {
          display: grid;
          gap: 24px;
        }

        .menu-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 20px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
        }

        .menu-item-info {
          flex: 1;
          padding-right: 20px;
        }

        .menu-item-name {
          font-family: var(--font-heading);
          font-size: 1.2rem;
          color: #fff;
          margin-bottom: 6px;
        }

        .menu-item-desc {
          font-family: var(--font-body);
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
          line-height: 1.4;
        }

        .menu-item-price {
          font-family: var(--font-heading);
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--gold-500);
          white-space: nowrap;
        }
      `}} />
      <div className="bg-void min-h-screen">
        <Header />
        <main>
          <section className="menu-page-header">
            <div className="container">
              <span className="menu-page-subtitle">In-Seat Dining</span>
              <h1 className="menu-page-title">Culinary Experience</h1>
            </div>
          </section>
          
          <section className="menu-section">
            <div className="menu-container">
              {menuCategories.map((category, idx) => (
                <div key={idx} className="menu-category">
                  <h2 className="menu-category-title">{category.title}</h2>
                  <div className="menu-grid">
                    {category.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="menu-item">
                        <div className="menu-item-info">
                          <h3 className="menu-item-name">{item.name}</h3>
                          <p className="menu-item-desc">{item.desc}</p>
                        </div>
                        <div className="menu-item-price">{item.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
