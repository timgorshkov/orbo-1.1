'use client';

import { useEffect } from 'react';
import { ymGoal } from './YandexMetrika';

interface OrgsPageTrackerProps {
  organizationsCount: number;
  hasAdminOrgs: boolean;
}

/**
 * Client component to track /orgs page view
 * Tracks: dashboard_view (every time) and auth_success (on each visit to dashboard)
 */
export function OrgsPageTracker({ organizationsCount, hasAdminOrgs }: OrgsPageTrackerProps) {
  useEffect(() => {
    // Track dashboard page view - every visit
    ymGoal('dashboard_view', { 
      organizations_count: organizationsCount,
      has_admin_orgs: hasAdminOrgs
    });
    
    // Track auth_success when user reaches dashboard (successful login)
    ymGoal('auth_success');
  }, [organizationsCount, hasAdminOrgs]);

  return null;
}
