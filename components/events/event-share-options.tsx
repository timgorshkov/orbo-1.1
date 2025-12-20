'use client';

import { useState, useRef, useEffect } from 'react';
import { Share2, Link as LinkIcon, Copy, Check, MessageCircle, ExternalLink } from 'lucide-react';

interface EventShareOptionsProps {
  eventId: string;
  eventTitle: string;
  orgId: string;
  isPublic?: boolean;
}

export default function EventShareOptions({ 
  eventId, 
  eventTitle, 
  orgId,
  isPublic = true 
}: EventShareOptionsProps) {
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedTelegram, setCopiedTelegram] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  // Generate links
  const webLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://my.orbo.ru'}/e/${eventId}`;
  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot';
  const telegramAppShortName = process.env.NEXT_PUBLIC_TELEGRAM_EVENT_APP_SHORT_NAME || 'events';
  // Format: https://t.me/botusername/appshortname?startapp=param
  const telegramLink = `https://t.me/${telegramBotUsername}/${telegramAppShortName}?startapp=e-${eventId}`;
  
  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);
  
  const copyToClipboard = async (text: string, type: 'web' | 'telegram') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'web') {
        setCopiedWeb(true);
        setTimeout(() => setCopiedWeb(false), 2000);
      } else {
        setCopiedTelegram(true);
        setTimeout(() => setCopiedTelegram(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <div className="relative">
      <button 
        ref={triggerRef}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
        onClick={() => setOpen(!open)}
      >
        <Share2 className="h-4 w-4" />
        Поделиться
      </button>
      
      {open && (
        <div 
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg border border-gray-200 shadow-lg z-50"
        >
          <div className="p-2">
            <p className="px-2 py-1.5 text-xs text-gray-500">
              Поделиться ссылкой на событие
            </p>
            
            <div className="h-px bg-gray-100 my-1" />
            
            {/* Web link */}
            <button
              onClick={() => copyToClipboard(webLink, 'web')}
              className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <LinkIcon className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Веб-ссылка</p>
                <p className="text-xs text-gray-500 truncate">{webLink}</p>
              </div>
              <div className="flex-shrink-0">
                {copiedWeb ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>
            
            {/* Telegram MiniApp link */}
            <button
              onClick={() => copyToClipboard(telegramLink, 'telegram')}
              className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Telegram MiniApp</p>
                <p className="text-xs text-gray-500 truncate">{telegramLink}</p>
              </div>
              <div className="flex-shrink-0">
                {copiedTelegram ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>
            
            <div className="h-px bg-gray-100 my-1" />
            
            {/* Open Telegram link */}
            <a 
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
              <span className="text-sm">Открыть в Telegram</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
