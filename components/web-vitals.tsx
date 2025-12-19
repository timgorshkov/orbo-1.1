'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { usePathname } from 'next/navigation';

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
 * Пороговые значения для предупреждений:
 * - LCP > 4s = плохо (цель < 2.5s)
 * - FID > 300ms = плохо (цель < 100ms)
 * - CLS > 0.25 = плохо (цель < 0.1)
 * - TTFB > 1.8s = плохо (цель < 0.8s)
 */

const THRESHOLDS = {
  LCP: { warn: 4000, critical: 10000 },    // ms
  FID: { warn: 300, critical: 1000 },      // ms
  CLS: { warn: 0.25, critical: 0.5 },      // score
  FCP: { warn: 3000, critical: 8000 },     // ms
  TTFB: { warn: 1800, critical: 5000 },    // ms
  INP: { warn: 500, critical: 1000 },      // ms
};

export function WebVitals() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    const { name, value, id, rating } = metric;
    
    // Определяем уровень проблемы
    const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
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
      const body = JSON.stringify({
        name,
        value: Math.round(name === 'CLS' ? value * 1000 : value), // CLS в миллисекундах для консистентности
        rating,
        level,
        pathname,
        id,
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

