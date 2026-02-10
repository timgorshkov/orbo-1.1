'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { usePathname } from 'next/navigation';
import { useRef, useEffect } from 'react';

/**
 * Web Vitals компонент для мониторинга производительности клиентских страниц
 * 
 * Метрики:
 * - LCP (Largest Contentful Paint) - время загрузки главного контента
 * - FID (First Input Delay) - задержка первого взаимодействия
 * - CLS (Cumulative Layout Shift) - смещение макета
 * - FCP (First Contentful Paint) - время первой отрисовки
 * - TTFB (Time to First Byte) - время до первого байта
 * - INP (Interaction to Next Paint) - задержка взаимодействия
 * 
 * Пороговые значения для предупреждений (повышены для реальных условий):
 * - LCP > 6s = warn, > 15s = critical (цель < 2.5s)
 * - FID > 500ms = warn, > 2000ms = critical (цель < 100ms)
 * - CLS > 0.3 = warn, > 0.5 = critical (цель < 0.1)
 * - TTFB > 2s = warn, > 8s = critical (цель < 0.8s)
 * - INP > 1s = warn, > 5s = critical (цель < 200ms)
 * 
 * Deduplication: Each metric ID is only sent once to prevent spam
 */

// Global set to track already-sent metric IDs (persists across re-renders)
const sentMetricIds = new Set<string>();
// Track which metric TYPES have been sent (FCP, LCP are one-time per page load)
// These metrics don't change on client-side navigation, so sending them again is noise
const sentPageLoadMetrics = new Set<string>();
// Rate limiting: max 10 metrics per second
let lastSendTime = 0;
let sendCount = 0;
const MAX_SENDS_PER_SECOND = 10;
// Page-load metrics that are measured once and don't change on SPA navigation
const PAGE_LOAD_METRICS = new Set(['FCP', 'LCP', 'TTFB']);

// Обычные пороги
const THRESHOLDS = {
  LCP: { warn: 6000, critical: 15000 },     // ms - повышены
  FID: { warn: 500, critical: 2000 },       // ms - повышены
  CLS: { warn: 0.3, critical: 0.5 },        // score - повышен warn (0.25 слишком строго)
  FCP: { warn: 5000, critical: 12000 },     // ms - повышены
  TTFB: { warn: 2000, critical: 8000 },     // ms - повышены
  INP: { warn: 1000, critical: 5000 },      // ms - повышены (1s-5s)
};

// Специальные пороги для тяжёлых страниц (available-groups загружает много данных)
const HEAVY_PAGE_THRESHOLDS = {
  LCP: { warn: 10000, critical: 30000 },    // ms
  FID: { warn: 1000, critical: 5000 },      // ms
  CLS: { warn: 0.5, critical: 0.8 },        // score - повышены (сложные страницы с динамическим контентом)
  FCP: { warn: 10000, critical: 25000 },    // ms
  TTFB: { warn: 5000, critical: 15000 },    // ms
  INP: { warn: 2000, critical: 10000 },     // ms
};

// Паттерны страниц с повышенными порогами (загружают много данных или динамический контент)
const HEAVY_PAGE_PATTERNS = [
  '/available-groups',
  '/telegram/groups/',  // Страницы отдельных групп тоже могут быть тяжёлыми
  '/telegram',          // Раздел телеграм
  '/members',           // Список участников
  '/events/',           // Страницы событий с регистрацией и формами
  '/events',            // Список событий
  '/dashboard',         // Дашборд с множеством графиков
  '/notifications',     // Уведомления (загружают много данных)
  '/auth',              // Страница авторизации с динамическим кодом
  '/apps',              // Раздел приложений (вторичный функционал)
  '/profile',           // Профиль участника (вторичный функционал)
  '/superadmin',        // Суперадминка (внутренний инструмент)
];

function isHeavyPage(pathname: string): boolean {
  return HEAVY_PAGE_PATTERNS.some(pattern => pathname.includes(pattern));
}

export function WebVitals() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    const { name, value, id, rating } = metric;
    
    // FCP, LCP, TTFB are page-load metrics — measured once per full page load.
    // On client-side SPA navigation, the browser re-reports the SAME stale value
    // but with the new pathname, creating misleading logs. Only send these once.
    if (PAGE_LOAD_METRICS.has(name)) {
      if (sentPageLoadMetrics.has(name)) {
        return; // Already sent this metric type for this page session
      }
      sentPageLoadMetrics.add(name);
    }
    
    // Deduplication: skip if already sent this exact metric ID
    if (sentMetricIds.has(id)) {
      return;
    }
    
    // Rate limiting: prevent spam
    const now = Date.now();
    if (now - lastSendTime > 1000) {
      sendCount = 0;
      lastSendTime = now;
    }
    if (sendCount >= MAX_SENDS_PER_SECOND) {
      return;
    }
    
    // Mark as sent
    sentMetricIds.add(id);
    sendCount++;
    
    // Cleanup old IDs after 1 minute to prevent memory leak
    if (sentMetricIds.size > 100) {
      sentMetricIds.clear();
    }
    
    // Выбираем пороги в зависимости от страницы
    const thresholds = isHeavyPage(pathname) ? HEAVY_PAGE_THRESHOLDS : THRESHOLDS;
    const threshold = thresholds[name as keyof typeof THRESHOLDS];
    
    let level: 'info' | 'warn' | 'error' = 'info';
    
    if (threshold) {
      if (value >= threshold.critical) {
        level = 'error';
      } else if (value >= threshold.warn) {
        level = 'warn';
      }
    }
    
    // Логируем только предупреждения и ошибки, или все метрики в dev
    const shouldLog = level !== 'info' || process.env.NODE_ENV === 'development';
    
    if (shouldLog) {
      // Отправляем на сервер для записи в логи
      // CLS показываем как есть (это score, не время), остальные округляем
      const displayValue = name === 'CLS' 
        ? Math.round(value * 1000) / 1000  // CLS: 3 знака после запятой (например 0.575)
        : Math.round(value);                // Остальные: целые ms
      
      const body = JSON.stringify({
        name,
        value: displayValue,
        rating,
        level,
        pathname,
        id,
        isHeavyPage: isHeavyPage(pathname),
        timestamp: new Date().toISOString(),
      });

      // Используем sendBeacon для надёжной отправки даже при закрытии страницы
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/vitals', body);
      } else {
        fetch('/api/vitals', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(() => {
          // Игнорируем ошибки отправки
        });
      }
    }
    
    // Также логируем в консоль браузера для отладки
    if (process.env.NODE_ENV === 'development') {
      const color = level === 'error' ? 'red' : level === 'warn' ? 'orange' : 'green';
      console.log(
        `%c[WebVitals] ${name}: ${Math.round(value)}${name === 'CLS' ? '' : 'ms'} (${rating})`,
        `color: ${color}`
      );
    }
  });

  return null;
}
