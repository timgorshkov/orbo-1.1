/**
 * Telegram WebApp Types
 * 
 * Global type declarations for Telegram Mini Apps.
 * Used across all tg-app pages.
 * 
 * This is an ambient declaration file - types are automatically available globally.
 */

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    setText: (text: string) => void;
    setParams: (params: { 
      text?: string; 
      color?: string; 
      text_color?: string; 
      is_active?: boolean; 
      is_visible?: boolean 
    }) => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  colorScheme: 'light' | 'dark';
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  version?: string;
  platform?: string;
  isVersionAtLeast?: (version: string) => boolean;
  // Available since Bot API 7.2 (April 2024). Shows the native "Allow @bot to
  // send you messages?" prompt. If the user already granted (or denied) write
  // access in the past, Telegram returns the previous answer without showing
  // the dialog again, so it's safe to call on every open.
  requestWriteAccess?: (callback?: (granted: boolean) => void) => void;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
