import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="website-footer">
      <div className="website-footer__container">
        <nav className="website-footer__links">
          <Link href="/product">Продукт</Link>
          <Link href="/crm">CRM</Link>
          <Link href="/notifications">Уведомления</Link>
          <Link href="/events">События</Link>
        </nav>
        <p className="website-footer__copy">
          © {currentYear} Команда Orbo
        </p>
      </div>
    </footer>
  );
}

export default Footer;
