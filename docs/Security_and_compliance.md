# Security & Compliance Assessment

## 1. Threat Model (STRIDE-lite)
| Threat | Vector | Current Controls | Gaps / Actions |
| --- | --- | --- | --- |
| **Spoofing** | Telegram webhook impersonation, session hijack | Secret token header validated in `/api/telegram/webhook`; Supabase Auth manages sessions; Telegram auth codes tied to DM. | No webhook signature verification for notification bot; session cookies rely on default settings. Add webhook rotate policy and enforce secure cookies. |
| **Tampering** | Service-role misuse, QR token replay | RLS on base tables; QR check-in updates status and logs activity. | Service-role clients bypass RLS without audit; QR tokens stored plain → hash  TTL  idempotency needed. |
| **Repudiation** | Admin actions unattributed | Console logs only. | Introduce `admin_action_log` (org_id, actor, action, metadata) and surface in UI; log Telegram bot commands with actor info. |
| **Information Disclosure** | Cross-tenant data leak, PII exposure in logs | RLS  Supabase policies, `merged_into` to hide duplicates. | Service-role queries fetch entire tables; logs print payloads (Telegram updates). Mask PII, enforce scoped RPC, redact logs. |
| **Denial of Service** | Telegram retry storms, abusive API usage | Webhook always returns 200 to avoid retries; no rate limits. | Add idempotency, per-org rate limiting, exponential backoff; integrate Supabase row limits for analytics queries. |
| **Elevation of Privilege** | Telegram admin auto-promoted without verification | `sync_telegram_admins` trusts Telegram admin list. | Verify bot admin rights, require dual confirmation before elevating to org admin, log promotions. |

## 2. PII Handling
- **Stored Data**: Participant names, emails, Telegram usernames/IDs, membership history, activity metadata. No message content stored; only metadata (counts, message IDs) recorded.
- **Data Minimization**: Activity events include metadata JSON with IDs, not message text. Ensure future extensions follow same principle.
- **Retention & Deletion**: No automated retention policy. Add cron to purge stale auth codes, archived Telegram admin cache, and provide org-level delete/export tooling.
- **Encryption**: Rely on Supabase-managed encryption at rest. Sensitive QR tokens should be stored hashed; payment tokens (future) must be stored encrypted or tokenized.

## 3. Access Controls
- Authentication via Supabase (email, Telegram). Multi-factor not available.
- Authorization through `memberships` roles and RPC gating. Need capability matrix for future corporate roles. Service-role usage must be audited and eventually constrained via Postgres security definer functions.

## 4. Logging & Observability
- Currently console-based logging without correlation IDs. Introduce structured logging with fields: `org_id`, `update_id`, `actor_id`, `request_id`. Ship logs to centralized sink with retention policy.
- Audit logs: implement `admin_action_log` with immutable rows, capturing actor, timestamp, action, target, metadata JSON.
- Alerts: configure Sentry for exceptions, create cron-based monitors for webhook staleness, auth-code failure spikes, payment reconcile issues.

## 5. Telegram Compliance
- **Admin Rights**: Bot must remain admin to read member lists; enforce verification when linking groups.
- **Rate Limits**: Follow 30 requests/second per bot; adopt queue/backoff for mass messaging modules.
- **Privacy**: Personal DMs require explicit `/start`; store timestamp of opt-in (auth code flow already implies). Do not store message bodies; maintain metadata only.
- **Content Storage**: Today only metadata stored; continue to avoid persisting message text/attachments to satisfy Telegram terms and privacy commitments.

## 6. Future Compliance Considerations
- **Payments**: Once YooKassa/Tinkoff integrated, ensure PCI scope minimal by delegating card entry to provider, storing only tokens  reconciliation data.
- **Corporate Pilots**: Provide DPA-ready documentation (data residency, retention policies), SOC2-style controls (audit logging, access reviews).
- **Data Subject Requests**: Build tooling to export/delete participant data by org and by user ID to satisfy GDPR-equivalent obligations.
