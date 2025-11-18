# Gap Analysis — Orbo 1.1 vs PRD & Strategy (November 2025)

Reference PRD: `prd.md`. Strategic priorities now mirror `docs/ROADMAP_FINAL_NOV15_2025.md` (solo cadence). Scenarios:
- **S1 Communities/Schools** — core PMF (Telegram-first CRM, events, retention dashboard).
- **S2 Corporate Layer** — access/offboarding/escalations for pilot teams.
- **S3 Marketplace v0** — internal mini-modules  extension API.

## 1. Capability Overview
| Domain | PRD Expectation | Current Implementation | Status |
| --- | --- | --- | --- |
| Tenant & Roles | Owner/admin/member viewer matrix; tenant-scoped data. | `organizations`, `memberships`, role RPCs (`get_user_role_in_org`). UI gating via `requireOrgAccess`. | ⚠️ Roles exist but service-role queries bypass RLS; no viewer role handling. |
| Telegram Onboarding | Bot admin check, webhook secret, sync participants forward-only. | `/api/telegram/webhook` handles updates, `syncOrgAdmins` enriches admin roles, UI to assign groups. | ⚠️ Works manually; lacks automated admin verification UI, idempotency, rate/backoff. |
| Participant CRM | Profiles, tags, reminders, search. | Members page lists participants; `ParticipantMatcher` dedupe; enrichment API. No tags/reminders, statuses manual. | ⚠️ Partial. |
| Payments | YooKassa/Tinkoff checkout, webhook, reconcile, membership sync. | No code, only placeholder docs. | ❌ Missing. |
| Events & QR | Event CRUD, calendar link, QR check-in, attendance report. | Event CRUD  registrations  QR check-in; Telegram notifications cron; no ICS/export, limited analytics. | ⚠️ Partial. |
| Dashboard & Analytics | DAU/WAU, join/leave 7/30, silent list, prime-time heatmap. | Dashboard aggregates last 14 days message counts, onboarding checklist. Lacks WAU/DAU, silent list, heatmap. | ⚠️ Partial. |
| Materials | Tree of docs/files/links with access control. | Material service enforces depth; list/search UI; access control limited (no UI for group-level ACL). | ⚠️ Partial. |
| Admin UX & Alerts | Quick actions, escalations, onboarding. | Onboarding checklist in dashboard; no automated alerts/escalations; admin removal manual. | ⚠️ Partial. |
| Corporate Layer | Offboarding (revoke Telegram), audit log, escalation routing. | `user_group_admin_status` table, `syncOrgAdmins` updates statuses. No offboarding workflow or audit surface. | ❌ Missing. |
| Marketplace Skeleton | Extension model, permissions, billing split. | `/app/app/[org]/integrations` placeholder; no schema. | ❌ Missing. |

## 2. Scenario Alignment
### S1 — Communities / Schools
- **Strengths**: Telegram webhook populates participants/metrics; dashboard onboarding and events UI present; materials tree stable.
- **Gaps**: Payments absent; participant lifecycle automation missing; analytics shallow; onboarding requires manual Telegram admin verification.
- **Risks**: Without payments/renewals churn risk remains; manual sync fragile.

### S2 — Corporate Layer
- **Strengths**: Membership roles and `syncOrgAdmins` groundwork; `user_group_admin_status` table stores admin checks.
- **Gaps**: No automated offboarding, audit log, or escalation notifications. Service-role usage prevents principle of least privilege.
- **Risks**: Enterprise pilots cannot rely on manual offboarding; compliance exposure (no admin audit trail).

### S3 — Marketplace v0
- **Strengths**: Integration page stub; Telegram data available for read-only analytics modules.
- **Gaps**: No extension tables, API keys, webhook/event bus. No digest/conflict modules.
- **Risks**: Cannot ship promised growth hooks; partner ecosystem blocked.

## 3. User Flows & Pain Points
### Owner (org creator)
1. Sign up → create org (`/orgs/new`).
2. Connect Telegram bot (`/app/[org]/telegram/setup-telegram`).
3. Assign available group to org, verify admin.
4. Invite admins via `organization_invites` UI.
5. Configure materials/events.

**Pain points**:
- Admin verification hidden; needs manual reload to reflect `is_verified`.
- No payments to monetize; plan column unused.
- No explicit onboarding runbook in app (docs only).

### Admin (team member)
1. Accept invite via email (Supabase magic link).
2. Manage participants (`/app/[org]/members`).
3. Schedule events, send reminders.
4. Monitor dashboard for activity.

**Pain points**:
- Members page loads via service role; slow on large org; no filters/tags.
- Event notifications rely on cron secret; failure silent.
- No audit log of admin actions.

### Participant (community member)
1. Joins Telegram group → auto-created participant.
2. Optionally registers for event (QR check-in).
3. Receives notifications (Telegram broadcast).

**Pain points**:
- No self-service portal; `/p/[org]` routes limited to event details.
- Renewal reminders missing.
- Telegram DM verification depends on notifications bot, fails if Start not pressed.

## 4. Blocking Gaps & Recommended Actions
| Gap | Impact | Recommendation |
| --- | --- | --- |
| Payments infrastructure absent | Cannot monetize; membership statuses manual | Implement YooKassa integration: checkout endpoint, webhook, `subscriptions` table, reconcile job (Wave 1). |
| RLS bypass via service role | Potential data leak; fails corp requirements | Introduce backend service layer with org-scoped RPCs; forbid service-role usage in request path (Wave 0). |
| Webhook idempotency removed | Duplicate participant joins/leaves; inconsistent metrics | Reintroduce `telegram_updates` or equivalent dedupe table keyed by `update_id` with TTL (Wave 0). |
| Observability & alerting minimal | Cron/webhook failures invisible | Add structured logging, Sentry, metrics for webhook latency/errors, cron heartbeat (Wave 0). |
| Corporate offboarding missing | Enterprise pilots blocked | Build offboarding workflow: revoke admin, remove from Telegram, audit entry  notification (Wave 2). |
| Marketplace scaffolding absent | Growth hooks delayed | Define `extensions`, `extension_installations`, event bus contract; seed with digest/conflict/request board modules (Wave 2). |

## 5. Architecture & Security Regression Audit (Nov 15)
- **Service-role overuse**: Dashboards, members UI, and API routes call `createAdminServer()` which hands out the Supabase service-role key per request. This bypasses RLS and violates the corp-layer requirement for scoped access (S2). Wave 0 work must move to RPCs  audit logs before onboarding more tenants.
- **Webhook idempotency removed**: `lib/services/eventProcessingService.ts` now ships without the old `telegram_updates` dedupe table, so Telegram retries create duplicate joins/leaves and miscounted metrics—directly blocking S1 analytics goals.
- **Automated webhook recovery without throttling**: `/api/telegram/webhook` immediately calls `webhookRecoveryService.recoverWebhook()` when the secret mismatches, which could thrash Telegram APIs and hide misconfiguration instead of surfacing an alert; S3 marketplace webhooks would amplify this risk.
- **Missing audit trail**: Migration 072 removed admin action logging and nothing replaced it. Without `admin_action_log`, we cannot prove who merged participants or reassigned Telegram groups, undermining S2 objectives.

## 6. Alignment with Solo Roadmap
- Wave sizing adjusted for single engineer throughput; each wave fits 4–5 high-effort items.
- Dependencies: Wave 0 stabilization (RLS, webhook, observability) unlocks later waves. Payments/renewals prioritized before growth features per solo roadmap doc.
