'use client';

import { useEffect, useRef } from 'react';
import { ymGoal } from './YandexMetrika';

interface OrgsPageTrackerProps {
  organizationsCount: number;
  hasAdminOrgs: boolean;
}

/**
 * Client component to track /orgs page view
 * Tracks: dashboard_view (once per page load) and auth_success (once per session)
 */
export function OrgsPageTracker({ organizationsCount, hasAdminOrgs }: OrgsPageTrackerProps) {
  const hasSent = useRef(false);
  
  useEffect(() => {
    // Prevent duplicate sends from React StrictMode or re-renders
    if (hasSent.current) return;
    hasSent.current = true;
    
    // Track dashboard page view - once per page load
    ymGoal('dashboard_view', { 
      organizations_count: organizationsCount,
      has_admin_orgs: hasAdminOrgs
    });
    
    // Track auth_success - once per session (user reached dashboard = successful auth)
    ymGoal('auth_success', undefined, { once: true });
  }, []); // Empty deps - run only once on mount

  return null;
}
