'use client';

import { useEffect } from 'react';
import { ymGoal } from './YandexMetrika';

interface OrgsPageTrackerProps {
  organizationsCount: number;
  hasAdminOrgs: boolean;
}

/**
 * Client component to track /orgs page view
 * This is the final step in the conversion funnel - user reaches dashboard
 */
export function OrgsPageTracker({ organizationsCount, hasAdminOrgs }: OrgsPageTrackerProps) {
  useEffect(() => {
    // Track dashboard page view - this is a key conversion!
    ymGoal('dashboard_view', { 
      organizations_count: organizationsCount,
      has_admin_orgs: hasAdminOrgs
    });
    
    // If user has organizations, they've completed the full funnel
    if (organizationsCount > 0) {
      ymGoal('user_activated', { organizations_count: organizationsCount });
    }
  }, [organizationsCount, hasAdminOrgs]);

  return null;
}
