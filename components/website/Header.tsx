'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

interface HeaderProps {
  transparent?: boolean;
}

export function Header({ transparent = true }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headerClass = `website-header ${isScrolled ? 'website-header--scrolled' : ''}`;

  return (
    <header className={headerClass}>
      <div className="website-header__container">
        <Link href="/" className="website-header__logo">
          <Image 
            src="/orbo-logo-2-no-bg.png" 
            alt="Orbo" 
            width={32} 
            height={32}
            className="website-header__logo-img"
          />
          <span>Orbo</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="website-header__nav">
          <Link href="/product">Продукт</Link>
          <Link href="/journal">Журнал</Link>
          <Link href="https://my.orbo.ru/signup" className="website-header__cta">
            Войти
          </Link>
        </nav>

        {/* Mobile Menu Button */}
        <button 
          className="website-header__menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="website-header__mobile-menu">
          <nav>
            <Link href="/product" onClick={() => setIsMobileMenuOpen(false)}>
              Продукт
            </Link>
            <Link href="/journal" onClick={() => setIsMobileMenuOpen(false)}>
              Журнал
            </Link>
            <Link 
              href="https://my.orbo.ru/signup" 
              className="website-header__cta"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Войти
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
