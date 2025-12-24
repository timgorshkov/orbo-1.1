'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'orbo_announcement_closed';
const HIDE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface AnnouncementBannerProps {
  message: string;
  linkText: string;
  linkHref: string;
  id?: string; // Unique ID for this announcement (to track different banners)
  onClose?: () => void;
  closable?: boolean;
}

export function AnnouncementBanner({ 
  message, 
  linkText, 
  linkHref, 
  id = 'default',
  onClose,
  closable = true 
}: AnnouncementBannerProps) {
  const [isVisible, setIsVisible] = useState(false); // Start hidden, check localStorage first
  const [isInitialized, setIsInitialized] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const storageKey = `${STORAGE_KEY}_${id}`;
    const closedAt = localStorage.getItem(storageKey);
    
    if (closedAt) {
      const closedTime = parseInt(closedAt, 10);
      const now = Date.now();
      
      // If closed less than 24 hours ago, keep hidden
      if (now - closedTime < HIDE_DURATION_MS) {
        setIsVisible(false);
        setIsInitialized(true);
        return;
      }
      
      // Otherwise, clear old timestamp and show
      localStorage.removeItem(storageKey);
    }
    
    setIsVisible(true);
    setIsInitialized(true);
  }, [id]);

  // Update parent class when visibility changes (fallback for browsers without :has())
  useEffect(() => {
    if (!isInitialized) return;
    
    const parent = document.querySelector('.website-root');
    if (parent) {
      if (isVisible) {
        parent.classList.add('has-announcement');
      } else {
        parent.classList.remove('has-announcement');
      }
    }
    return () => {
      const parent = document.querySelector('.website-root');
      if (parent) {
        parent.classList.remove('has-announcement');
      }
    };
  }, [isVisible, isInitialized]);

  // Don't render anything until we check localStorage (prevents flash)
  if (!isInitialized || !isVisible) return null;

  const handleClose = () => {
    // Save close timestamp to localStorage
    const storageKey = `${STORAGE_KEY}_${id}`;
    localStorage.setItem(storageKey, Date.now().toString());
    
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
