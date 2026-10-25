import React from 'react';
import Header from '@/features/shared/components/Header';
import Footer from '@/features/shared/components/Footer';
import styles from './page.module.css';

export const metadata = {
  title: 'Food & drinks',
  description: 'Popcorn, drinks and snacks served to your seat at Dhrub Cineplex, Bagaha.',
};

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

  const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 32, maxWidth: 820 }}>
        <h1 className="display" style={{ fontSize: 'clamp(2.25rem, 7vw, 3.75rem)' }}>Food &amp; drinks</h1>
        <p className={styles.lead}>Served to your seat, so you never miss a moment of the film.</p>

        <nav className={styles.jump} aria-label="Menu sections">
          {menuCategories.map(category => (
            <a key={category.title} href={`#${slug(category.title)}`}>{category.title}</a>
          ))}
        </nav>

        {menuCategories.map((category) => (
          <section key={category.title} id={slug(category.title)} className={styles.category} aria-labelledby={`${slug(category.title)}-heading`}>
            <h2 id={`${slug(category.title)}-heading`} className={`display ${styles.categoryTitle}`}>{category.title}</h2>
            <ul className={styles.items}>
              {category.items.map((item) => (
                <li key={item.name} className={styles.item}>
                  <div>
                    <h3 className={styles.itemName}>{item.name}</h3>
                    <p className={styles.itemDesc}>{item.desc}</p>
                  </div>
                  <span className={styles.price}>{item.price}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}
