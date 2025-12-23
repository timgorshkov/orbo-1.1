'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';

interface AnnouncementBannerProps {
  message: string;
  linkText: string;
  linkHref: string;
  onClose?: () => void;
  closable?: boolean;
}

export function AnnouncementBanner({ 
  message, 
  linkText, 
  linkHref, 
  onClose,
  closable = true 
}: AnnouncementBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Update parent class when visibility changes (fallback for browsers without :has())
  useEffect(() => {
    const parent = document.querySelector('.website-root');
    if (parent) {
      if (isVisible) {
        parent.classList.add('has-announcement');
      } else {
        parent.classList.remove('has-announcement');
      }
    }
    return () => {
      // Cleanup on unmount
      const parent = document.querySelector('.website-root');
      if (parent) {
        parent.classList.remove('has-announcement');
      }
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  return (
    <div className="announcement-banner">
      <div className="announcement-banner__content">
        <AlertTriangle size={16} className="announcement-banner__icon" />
        <span className="announcement-banner__text">{message}</span>
        <Link href={linkHref} className="announcement-banner__link">
          {linkText}
          <ArrowRight size={14} />
        </Link>
        {closable && (
          <button 
            onClick={handleClose}
            className="announcement-banner__close"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default AnnouncementBanner;
