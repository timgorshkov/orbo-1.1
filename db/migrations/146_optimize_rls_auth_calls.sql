-- Migration: Optimize RLS policies - wrap auth.uid() in (select auth.uid())
-- Date: 2024-12-12
-- Issue: auth_rls_initplan - auth functions re-evaluated for each row
-- Fix: Use (select auth.uid()) instead of auth.uid() for better performance

-- =====================================================
-- 1. ORGANIZATIONS
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Owners can update their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Пользователи могут читать свои ор" ON public.organizations;
DROP POLICY IF EXISTS "Владельцы могут обновлять свои ор" ON public.organizations;
DROP POLICY IF EXISTS "organizations_all_policy" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations;

-- Recreate with optimized auth calls
CREATE POLICY "Users can view their organizations"
ON public.organizations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = organizations.id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Owners and admins can update organization"
ON public.organizations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = organizations.id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK ((select auth.uid()) IS NOT NULL);

-- =====================================================
-- 2. MEMBERSHIPS
-- =====================================================

DROP POLICY IF EXISTS "Admins can insert new memberships" ON public.memberships;
DROP POLICY IF EXISTS "Admins can update memberships" ON public.memberships;
DROP POLICY IF EXISTS "Admins can delete memberships" ON public.memberships;
DROP POLICY IF EXISTS "Пользователи могут читать свои чл" ON public.memberships;
DROP POLICY IF EXISTS "memberships_all_policy" ON public.memberships;
DROP POLICY IF EXISTS "Users can view memberships of their organizations" ON public.memberships;

CREATE POLICY "Users can view memberships of their organizations"
ON public.memberships FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m2
    WHERE m2.org_id = memberships.org_id
    AND m2.user_id = (select auth.uid())
  )
  OR memberships.user_id = (select auth.uid())
);

CREATE POLICY "Admins can insert new memberships"
ON public.memberships FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = memberships.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can update memberships"
ON public.memberships FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = memberships.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can delete memberships"
ON public.memberships FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = memberships.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 3. PARTICIPANTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage participants" ON public.participants;
DROP POLICY IF EXISTS "participants_select_policy" ON public.participants;
DROP POLICY IF EXISTS "Users can view participants in their organization" ON public.participants;
DROP POLICY IF EXISTS "participants_insert_policy" ON public.participants;

CREATE POLICY "Users can view participants in their organization"
ON public.participants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = participants.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Admins can manage participants"
ON public.participants FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = participants.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 4. ACTIVITY_EVENTS
-- =====================================================

DROP POLICY IF EXISTS "activity_events_select_policy" ON public.activity_events;
DROP POLICY IF EXISTS "activity_events_update_policy" ON public.activity_events;
DROP POLICY IF EXISTS "activity_events_delete_policy" ON public.activity_events;

CREATE POLICY "activity_events_select_policy"
ON public.activity_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = activity_events.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "activity_events_update_policy"
ON public.activity_events FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = activity_events.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "activity_events_delete_policy"
ON public.activity_events FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = activity_events.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 5. GROUP_METRICS
-- =====================================================

DROP POLICY IF EXISTS "group_metrics_select_policy" ON public.group_metrics;
DROP POLICY IF EXISTS "group_metrics_update_policy" ON public.group_metrics;
DROP POLICY IF EXISTS "group_metrics_delete_policy" ON public.group_metrics;

CREATE POLICY "group_metrics_select_policy"
ON public.group_metrics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = group_metrics.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "group_metrics_update_policy"
ON public.group_metrics FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = group_metrics.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "group_metrics_delete_policy"
ON public.group_metrics FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = group_metrics.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 6. PARTICIPANT_GROUPS
-- =====================================================

DROP POLICY IF EXISTS "participant_groups_select_policy" ON public.participant_groups;

CREATE POLICY "participant_groups_select_policy"
ON public.participant_groups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.memberships m ON m.org_id = p.org_id
    WHERE p.id = participant_groups.participant_id
    AND m.user_id = (select auth.uid())
  )
);

-- =====================================================
-- 7. MATERIAL_PAGES
-- =====================================================

DROP POLICY IF EXISTS "Org members can view materials" ON public.material_pages;
DROP POLICY IF EXISTS "Activated admins can create materials" ON public.material_pages;
DROP POLICY IF EXISTS "Activated admins can update materials" ON public.material_pages;
DROP POLICY IF EXISTS "Activated admins can delete materials" ON public.material_pages;

CREATE POLICY "Org members can view materials"
ON public.material_pages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = material_pages.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Activated admins can create materials"
ON public.material_pages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = material_pages.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Activated admins can update materials"
ON public.material_pages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = material_pages.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Activated admins can delete materials"
ON public.material_pages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = material_pages.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 8. TELEGRAM_GROUPS
-- =====================================================

DROP POLICY IF EXISTS "Org members can view their groups" ON public.telegram_groups;
DROP POLICY IF EXISTS "Org admins can update their groups" ON public.telegram_groups;

CREATE POLICY "Org members can view their groups"
ON public.telegram_groups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.org_telegram_groups otg
    JOIN public.memberships m ON m.org_id = otg.org_id
    WHERE otg.tg_chat_id = telegram_groups.tg_chat_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Org admins can update their groups"
ON public.telegram_groups FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.org_telegram_groups otg
    JOIN public.memberships m ON m.org_id = otg.org_id
    WHERE otg.tg_chat_id = telegram_groups.tg_chat_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 9. EVENTS
-- =====================================================

DROP POLICY IF EXISTS "Organization members can view their org events" ON public.events;
DROP POLICY IF EXISTS "Only owner/admin can create events" ON public.events;
DROP POLICY IF EXISTS "Only owner/admin can update events" ON public.events;
DROP POLICY IF EXISTS "Only owner/admin can delete events" ON public.events;
DROP POLICY IF EXISTS "Activated admins can create events" ON public.events;
DROP POLICY IF EXISTS "Activated admins can update events" ON public.events;
DROP POLICY IF EXISTS "Activated admins can delete events" ON public.events;
DROP POLICY IF EXISTS "Members can view published events" ON public.events;

-- Keep public events viewable by everyone (no auth check needed)
-- DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;

CREATE POLICY "Organization members can view their org events"
ON public.events FOR SELECT
USING (
  is_public = true
  OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = events.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Admins can create events"
ON public.events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = events.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can update events"
ON public.events FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = events.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can delete events"
ON public.events FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = events.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 10. EVENT_TELEGRAM_NOTIFICATIONS
-- =====================================================

DROP POLICY IF EXISTS "Org admins can view event notifications" ON public.event_telegram_notifications;
DROP POLICY IF EXISTS "Org admins can create event notifications" ON public.event_telegram_notifications;

CREATE POLICY "Org admins can view event notifications"
ON public.event_telegram_notifications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_telegram_notifications.event_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Org admins can create event notifications"
ON public.event_telegram_notifications FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.org_id = e.org_id
    WHERE e.id = event_telegram_notifications.event_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 11. INVITATIONS
-- =====================================================

DROP POLICY IF EXISTS "Org admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Users can view their invitations" ON public.invitations;

CREATE POLICY "Org admins can manage invitations"
ON public.invitations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = invitations.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Users can view their invitations"
ON public.invitations FOR SELECT
USING (
  email = (select auth.jwt() ->> 'email')
);

-- =====================================================
-- 12. USER_TELEGRAM_ACCOUNTS
-- =====================================================

DROP POLICY IF EXISTS "user_telegram_accounts_select_policy" ON public.user_telegram_accounts;
DROP POLICY IF EXISTS "user_telegram_accounts_insert_policy" ON public.user_telegram_accounts;
DROP POLICY IF EXISTS "user_telegram_accounts_update_policy" ON public.user_telegram_accounts;

CREATE POLICY "user_telegram_accounts_select_policy"
ON public.user_telegram_accounts FOR SELECT
USING (user_id = (select auth.uid()));

CREATE POLICY "user_telegram_accounts_insert_policy"
ON public.user_telegram_accounts FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "user_telegram_accounts_update_policy"
ON public.user_telegram_accounts FOR UPDATE
USING (user_id = (select auth.uid()));

-- =====================================================
-- 13. TELEGRAM_GROUP_ADMINS
-- =====================================================

DROP POLICY IF EXISTS "telegram_group_admins_insert_policy" ON public.telegram_group_admins;

CREATE POLICY "telegram_group_admins_insert_policy"
ON public.telegram_group_admins FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_telegram_groups otg
    JOIN public.memberships m ON m.org_id = otg.org_id
    WHERE otg.tg_chat_id = telegram_group_admins.tg_chat_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 14. TELEGRAM_VERIFICATION_LOGS
-- =====================================================

DROP POLICY IF EXISTS "telegram_verification_logs_select_policy" ON public.telegram_verification_logs;
DROP POLICY IF EXISTS "telegram_verification_logs_insert_policy" ON public.telegram_verification_logs;

CREATE POLICY "telegram_verification_logs_select_policy"
ON public.telegram_verification_logs FOR SELECT
USING (user_id = (select auth.uid()));

CREATE POLICY "telegram_verification_logs_insert_policy"
ON public.telegram_verification_logs FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- =====================================================
-- 15. ORG_TELEGRAM_GROUPS
-- =====================================================

DROP POLICY IF EXISTS "org_telegram_groups_write" ON public.org_telegram_groups;

CREATE POLICY "org_telegram_groups_write"
ON public.org_telegram_groups FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = org_telegram_groups.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 16. ORGANIZATION_INVITES
-- =====================================================

DROP POLICY IF EXISTS "Admins can create invites" ON public.organization_invites;
DROP POLICY IF EXISTS "Admins can view org invites" ON public.organization_invites;
DROP POLICY IF EXISTS "Admins can update org invites" ON public.organization_invites;
DROP POLICY IF EXISTS "Admins can delete org invites" ON public.organization_invites;

CREATE POLICY "Admins can view org invites"
ON public.organization_invites FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = organization_invites.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can create invites"
ON public.organization_invites FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = organization_invites.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can update org invites"
ON public.organization_invites FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = organization_invites.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can delete org invites"
ON public.organization_invites FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = organization_invites.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 17. ORGANIZATION_INVITE_USES (if exists)
-- =====================================================

DROP POLICY IF EXISTS "Admins can view invite uses" ON public.organization_invite_uses;

CREATE POLICY "Admins can view invite uses"
ON public.organization_invite_uses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_invites oi
    JOIN public.memberships m ON m.org_id = oi.org_id
    WHERE oi.id = organization_invite_uses.invite_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 18. PARTICIPANT_MESSAGES
-- =====================================================

DROP POLICY IF EXISTS "participant_messages_select_policy" ON public.participant_messages;
DROP POLICY IF EXISTS "participant_messages_update_policy" ON public.participant_messages;
DROP POLICY IF EXISTS "participant_messages_delete_policy" ON public.participant_messages;

CREATE POLICY "participant_messages_select_policy"
ON public.participant_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.memberships m ON m.org_id = p.org_id
    WHERE p.id = participant_messages.participant_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "participant_messages_update_policy"
ON public.participant_messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.memberships m ON m.org_id = p.org_id
    WHERE p.id = participant_messages.participant_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "participant_messages_delete_policy"
ON public.participant_messages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.memberships m ON m.org_id = p.org_id
    WHERE p.id = participant_messages.participant_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 19. SUPERADMINS
-- =====================================================

DROP POLICY IF EXISTS "Superadmins can view all superadmins" ON public.superadmins;
DROP POLICY IF EXISTS "Superadmins can insert superadmins" ON public.superadmins;
DROP POLICY IF EXISTS "Superadmins can update superadmins" ON public.superadmins;

CREATE POLICY "Superadmins can view all superadmins"
ON public.superadmins FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

CREATE POLICY "Superadmins can insert superadmins"
ON public.superadmins FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

CREATE POLICY "Superadmins can update superadmins"
ON public.superadmins FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

-- =====================================================
-- 20. ERROR_LOGS
-- =====================================================

DROP POLICY IF EXISTS "error_logs_select" ON public.error_logs;

CREATE POLICY "error_logs_select"
ON public.error_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

-- =====================================================
-- 21. TELEGRAM_HEALTH_EVENTS
-- =====================================================

DROP POLICY IF EXISTS "telegram_health_select" ON public.telegram_health_events;

CREATE POLICY "telegram_health_select"
ON public.telegram_health_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

-- =====================================================
-- 22. ADMIN_ACTION_LOG
-- =====================================================

DROP POLICY IF EXISTS "admin_action_select" ON public.admin_action_log;

CREATE POLICY "admin_action_select"
ON public.admin_action_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

-- =====================================================
-- 23. SUBSCRIPTIONS
-- =====================================================

DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_delete" ON public.subscriptions;

CREATE POLICY "subscriptions_select"
ON public.subscriptions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = subscriptions.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "subscriptions_insert"
ON public.subscriptions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = subscriptions.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "subscriptions_update"
ON public.subscriptions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = subscriptions.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "subscriptions_delete"
ON public.subscriptions FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = subscriptions.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 24. APPS
-- =====================================================

DROP POLICY IF EXISTS "Users can view apps in their orgs" ON public.apps;
DROP POLICY IF EXISTS "Admins can create apps" ON public.apps;
DROP POLICY IF EXISTS "Admins can update apps" ON public.apps;
DROP POLICY IF EXISTS "Members apps viewable by participants" ON public.apps;
DROP POLICY IF EXISTS "Private apps viewable by admins" ON public.apps;
DROP POLICY IF EXISTS "Admins can view all org apps" ON public.apps;
DROP POLICY IF EXISTS "Public apps viewable by everyone" ON public.apps;

CREATE POLICY "Apps viewable by org members"
ON public.apps FOR SELECT
USING (
  visibility = 'public'
  OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = apps.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Admins can create apps"
ON public.apps FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = apps.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins can update apps"
ON public.apps FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = apps.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 25. APP_COLLECTIONS
-- =====================================================

DROP POLICY IF EXISTS "Users can view collections in their orgs" ON public.app_collections;
DROP POLICY IF EXISTS "App collections inherit app visibility" ON public.app_collections;

CREATE POLICY "Collections viewable by org members"
ON public.app_collections FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.apps a
    JOIN public.memberships m ON m.org_id = a.org_id
    WHERE a.id = app_collections.app_id
    AND m.user_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.apps a
    WHERE a.id = app_collections.app_id
    AND a.visibility = 'public'
  )
);

-- =====================================================
-- 26. APP_ITEMS
-- =====================================================

DROP POLICY IF EXISTS "Users can view items in their orgs" ON public.app_items;
DROP POLICY IF EXISTS "Members can create items" ON public.app_items;
DROP POLICY IF EXISTS "Owners can update their items" ON public.app_items;
DROP POLICY IF EXISTS "Owners can delete their items" ON public.app_items;
DROP POLICY IF EXISTS "App items inherit app visibility" ON public.app_items;

CREATE POLICY "Items viewable by org members"
ON public.app_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.app_collections c
    JOIN public.apps a ON a.id = c.app_id
    JOIN public.memberships m ON m.org_id = a.org_id
    WHERE c.id = app_items.collection_id
    AND m.user_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.app_collections c
    JOIN public.apps a ON a.id = c.app_id
    WHERE c.id = app_items.collection_id
    AND a.visibility = 'public'
  )
);

CREATE POLICY "Members can create items"
ON public.app_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.app_collections c
    JOIN public.apps a ON a.id = c.app_id
    JOIN public.memberships m ON m.org_id = a.org_id
    WHERE c.id = app_items.collection_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "Owners can update their items"
ON public.app_items FOR UPDATE
USING (
  creator_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.app_collections c
    JOIN public.apps a ON a.id = c.app_id
    JOIN public.memberships m ON m.org_id = a.org_id
    WHERE c.id = app_items.collection_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners can delete their items"
ON public.app_items FOR DELETE
USING (
  creator_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.app_collections c
    JOIN public.apps a ON a.id = c.app_id
    JOIN public.memberships m ON m.org_id = a.org_id
    WHERE c.id = app_items.collection_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 27. APP_ANALYTICS_EVENTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view analytics" ON public.app_analytics_events;

CREATE POLICY "Admins can view analytics"
ON public.app_analytics_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.apps a
    JOIN public.memberships m ON m.org_id = a.org_id
    WHERE a.id = app_analytics_events.app_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 28. AI_REQUESTS (if exists)
-- =====================================================

DROP POLICY IF EXISTS "Superadmins can view all AI requests" ON public.ai_requests;

CREATE POLICY "Superadmins can view all AI requests"
ON public.ai_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

-- =====================================================
-- 29. PAYMENTS (if exists)
-- =====================================================

DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;
DROP POLICY IF EXISTS "payments_delete" ON public.payments;

CREATE POLICY "payments_select"
ON public.payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.memberships m ON m.org_id = s.org_id
    WHERE s.id = payments.subscription_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "payments_insert"
ON public.payments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.memberships m ON m.org_id = s.org_id
    WHERE s.id = payments.subscription_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payments_update"
ON public.payments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.memberships m ON m.org_id = s.org_id
    WHERE s.id = payments.subscription_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payments_delete"
ON public.payments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.memberships m ON m.org_id = s.org_id
    WHERE s.id = payments.subscription_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 30. PAYMENT_METHODS (if exists)
-- =====================================================

DROP POLICY IF EXISTS "payment_methods_select" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_insert" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_update" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_delete" ON public.payment_methods;

CREATE POLICY "payment_methods_select"
ON public.payment_methods FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_methods.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "payment_methods_insert"
ON public.payment_methods FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_methods.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_methods_update"
ON public.payment_methods FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_methods.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_methods_delete"
ON public.payment_methods FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = payment_methods.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 31. WHATSAPP_IMPORTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view org imports" ON public.whatsapp_imports;
DROP POLICY IF EXISTS "Service role full access" ON public.whatsapp_imports;

CREATE POLICY "Admins can view org imports"
ON public.whatsapp_imports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = whatsapp_imports.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 32. OPENAI_API_LOGS
-- =====================================================

DROP POLICY IF EXISTS "Superadmins can view all API logs" ON public.openai_api_logs;
DROP POLICY IF EXISTS "Organization owners can view their API logs" ON public.openai_api_logs;

CREATE POLICY "Superadmins can view all API logs"
ON public.openai_api_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.superadmins sa
    WHERE sa.user_id = (select auth.uid())
  )
);

CREATE POLICY "Organization owners can view their API logs"
ON public.openai_api_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = openai_api_logs.org_id
    AND m.user_id = (select auth.uid())
    AND m.role = 'owner'
  )
);

-- =====================================================
-- 33. PARTICIPANT_TAGS
-- =====================================================

DROP POLICY IF EXISTS "participant_tags_select_policy" ON public.participant_tags;
DROP POLICY IF EXISTS "participant_tags_insert_policy" ON public.participant_tags;
DROP POLICY IF EXISTS "participant_tags_update_policy" ON public.participant_tags;
DROP POLICY IF EXISTS "participant_tags_delete_policy" ON public.participant_tags;

CREATE POLICY "participant_tags_select_policy"
ON public.participant_tags FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = participant_tags.org_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "participant_tags_insert_policy"
ON public.participant_tags FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = participant_tags.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "participant_tags_update_policy"
ON public.participant_tags FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = participant_tags.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "participant_tags_delete_policy"
ON public.participant_tags FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = participant_tags.org_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 34. PARTICIPANT_TAG_ASSIGNMENTS
-- =====================================================

DROP POLICY IF EXISTS "participant_tag_assignments_select_policy" ON public.participant_tag_assignments;
DROP POLICY IF EXISTS "participant_tag_assignments_insert_policy" ON public.participant_tag_assignments;
DROP POLICY IF EXISTS "participant_tag_assignments_delete_policy" ON public.participant_tag_assignments;

CREATE POLICY "participant_tag_assignments_select_policy"
ON public.participant_tag_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participant_tags pt
    JOIN public.memberships m ON m.org_id = pt.org_id
    WHERE pt.id = participant_tag_assignments.tag_id
    AND m.user_id = (select auth.uid())
  )
);

CREATE POLICY "participant_tag_assignments_insert_policy"
ON public.participant_tag_assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.participant_tags pt
    JOIN public.memberships m ON m.org_id = pt.org_id
    WHERE pt.id = participant_tag_assignments.tag_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "participant_tag_assignments_delete_policy"
ON public.participant_tag_assignments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.participant_tags pt
    JOIN public.memberships m ON m.org_id = pt.org_id
    WHERE pt.id = participant_tag_assignments.tag_id
    AND m.user_id = (select auth.uid())
    AND m.role IN ('owner', 'admin')
  )
);

-- =====================================================
-- 35. PARTICIPANT_TRAITS (if exists)
-- =====================================================

DROP POLICY IF EXISTS "Org admins can view participant traits" ON public.participant_traits;

CREATE POLICY "Org admins can view participant traits"
ON public.participant_traits FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.participants p
    JOIN public.memberships m ON m.org_id = p.org_id
    WHERE p.id = participant_traits.participant_id
    AND m.user_id = (select auth.uid())
  )
);

-- =====================================================
-- Summary
-- =====================================================

COMMENT ON SCHEMA public IS 'RLS policies optimized with (select auth.uid()) for better performance - Migration 146';

