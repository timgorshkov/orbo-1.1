'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  
  // Generate links
  const webLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://my.orbo.ru'}/e/${eventId}`;
  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_EVENT_BOT_USERNAME || 'orbo_event_bot';
  const telegramAppShortName = process.env.NEXT_PUBLIC_TELEGRAM_EVENT_APP_SHORT_NAME || 'events';
  // Format: https://t.me/botusername/appshortname?startapp=param
  const telegramLink = `https://t.me/${telegramBotUsername}/${telegramAppShortName}?startapp=e-${eventId}`;
  
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Поделиться
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 z-50">
        <DropdownMenuLabel className="font-normal text-xs text-gray-500">
          Поделиться ссылкой на событие
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Web link */}
        <DropdownMenuItem 
          onSelect={(e) => {
            e.preventDefault();
            copyToClipboard(webLink, 'web');
          }}
          className="cursor-pointer"
        >
          <div className="flex items-center gap-3 w-full">
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
          </div>
        </DropdownMenuItem>
        
        {/* Telegram MiniApp link */}
        <DropdownMenuItem 
          onSelect={(e) => {
            e.preventDefault();
            copyToClipboard(telegramLink, 'telegram');
          }}
          className="cursor-pointer"
        >
          <div className="flex items-center gap-3 w-full">
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
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Open Telegram link */}
        <DropdownMenuItem asChild>
          <a 
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 cursor-pointer"
          >
            <ExternalLink className="h-4 w-4 text-gray-400" />
            <span>Открыть в Telegram</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

