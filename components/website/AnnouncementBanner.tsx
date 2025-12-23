'use client';

import { useState } from 'react';
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
      </div>
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
  );
}

export default AnnouncementBanner;
