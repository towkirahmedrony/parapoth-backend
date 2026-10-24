# Porokh RBAC implementation and deployment guide

**Status (2026-10-24):** the coordinated source changes are on `main` in all three repositories. The forward-only migration was applied to the live ParaPoth Supabase project as migration version `20261024075947` (`canonical_rbac_hardening`). The application-level permission schema/mappings and security objects changed; user role assignments were not changed. There is still no Super Admin, by explicit instruction.

## Source of truth and canonical roles

`public.user_roles` is the authoritative role source. The trusted actor is the verified Supabase Auth identity (`auth.uid()` / the verified bearer token), not frontend state, request-body role fields, or editable user metadata. `public.role_permissions` and `public.permissions` are the authoritative operation-level permission map. Backend request authorization resolves the canonical active database role and, where required, asks the database `has_permission(text)` under the caller's JWT. A database lookup failure denies access. The client role hook and navigation/route guards are presentation controls only.

The only canonical identifiers are `super_admin`, `admin`, `moderator`, `editor`, `teacher`, and `student`. The migration adds database constraints and a one-active-role-per-user partial unique index. Existing valid rows are preserved; it stops before changing schema if live users have multiple active roles. It does not silently reassign existing users.

### Permission registry

| Permission | Intended operation / default holders |
|---|---|
| `users.read` | Limited user-record reads: Admin, Super Admin |
| `users.manage` | Authorized user management and account suspension: Admin, Super Admin |
| `roles.assign.staff` | Assign/revoke Student, Moderator, Editor, Teacher: Admin, Super Admin |
| `roles.assign.admin` | Assign/revoke Admin: Super Admin only; fixed Super Admin authority |
| `roles.assign.super_admin` | Assign/revoke Super Admin: Super Admin only; fixed Super Admin authority |
| `exams.manage` | Exam operations: Admin, Super Admin |
| `questions.manage` | Question authoring/configuration: Admin, Editor, Teacher, Super Admin |
| `questions.review` | Question review: Admin, Moderator, Super Admin |
| `moderation.review` | Moderation report review: Admin, Moderator, Super Admin |
| `moderation.action` | Authorized moderation actions: Admin, Moderator, Super Admin |
| `analytics.read` | Administrative analytics: Admin, Super Admin |
| `settings.manage` | Global settings: Admin, Super Admin |
| `audit_logs.read` | Security audit log: Super Admin only |
| `quotas.manage` | Quotas, plans, entitlements: Admin, Super Admin |
| `enterprise.manage` | Enterprise operations: Admin, Super Admin |

These are explicit grants, not a role hierarchy. Super Admin's global override is explicit in the backend route policy; its database permission set is seeded and its mapping cannot be edited through the permission RPC. Moderator does not receive authoring, Editor/Teacher do not receive moderation, and Admin does not receive `roles.assign.admin` or `roles.assign.super_admin`. Editor/Teacher question updates require matching `created_by` ownership at both lookup and final update; the question write service independently rejects Student writes.

## Role assignment and bootstrap

`assign_user_role(uuid,text,boolean)` derives the actor from `auth.uid()`, validates the requested role and target, denies self-change, checks both the target's current and requested privileged roles, serializes assignments, records changes transactionally, invalidates tracked privileged sessions on a role change, and protects the last active Super Admin. Admin may assign/revoke only the approved lower-role set. A revocation downgrades the target to an active Student role rather than leaving the account without an active authorization record. Super Admin assignment/revocation requires Super Admin authority and the corresponding fixed permission.

The privacy-preserving live role-count snapshot after migration remains **0 Super Admin, 1 Admin, and 2 Student assignments**, with no inactive or unknown role values. The migration seeded the permission map (15 Super Admin, 12 Admin, 3 Moderator, 1 Editor, 1 Teacher; no Student grants). No identity was selected or promoted. The migration intentionally has no public bootstrap endpoint. Because there is no existing Super Admin, the first one must be established as a controlled break-glass action by the Supabase project/database owner after approval:

1. Review this migration and the live schema again; take a current backup and apply/test it in a disposable or staging project first.
2. Obtain an explicit organizational decision naming the first Super Admin. Independently verify that exact account through an approved primary work contact and confirm its profile is active. Do not choose an arbitrary user or promote every Admin.
3. In a scheduled maintenance window, use the trusted Supabase project-owner SQL channel to update only that exact active user's existing role row from `admin` to `super_admin`, preserving the one-active-role constraint. Set `assigned_by` to the actual approving existing Admin's user ID, verify exactly one row changed, and commit only after checking the role counts and the generated security-audit event. If any precondition fails, roll back.
4. Verify that the new Super Admin can use role-management/security routes and that the ordinary Admin cannot. Thereafter all assignments use the protected RPC. Never add a public bootstrap route or place a secret in frontend code.

The trigger records a database-owner bootstrap as an attributed role change when the actual approving Admin ID is placed in `assigned_by`; do not invent an actor. Recovery from a lost/disabled sole Super Admin uses the same owner-controlled, reviewed break-glass process, with a backup, explicit approval, exact target, and audit evidence. The last-active-Super-Admin protection remains in force for ordinary RPC calls.

## Database migration and historical drift

Applied migration source (renamed to match the live Supabase ledger version; SQL was not rerun): [`20261024075947_canonical_rbac_hardening.sql`](../supabase/migrations/20261024075947_canonical_rbac_hardening.sql).

It is forward-only and transactional. It adds role checks and the active-role index; seeds canonical permissions without deleting existing mappings; creates `has_permission`, protected `assign_user_role` and `set_role_permission` RPCs; tightens `is_admin`; creates append-only-for-application-roles `security_audit_logs` and `admin_auth_sessions`; adds role/permission/audit mirror triggers; revokes direct role and audit-log DML from application/service API roles; and creates role-change, session registration/revocation, logout, and account-status RPCs. Security-definer functions use an empty fixed `search_path`, fully qualified objects, caller identity checks, and explicit execute grants. Audit records avoid tokens and copy no legacy `details` payload into the security log.

The repository/live migration history discrepancy remains unresolved: before deployment the live project had 21 applied migrations, while the selected repositories did not contain a complete matching history (only a small subset of migration files was recoverable). The RBAC migration is now recorded as version `20261024075947`, making 22 entries. Historical migrations were not fabricated or rewritten. Preserve Supabase's existing migration ledger; do not use database reset, blind replay, or destructive reconciliation. Staging validation was not performed; production approval was explicitly given and the migration executed successfully.

## Session revocation

Supabase access tokens are not directly invalidated by deleting a custom application row. `admin_auth_sessions` stores only the Supabase JWT `session_id` UUID, never the JWT. The server registers a valid Admin/Super Admin session on its first protected request and checks the ledger and active profile/role on every privileged request. Role downgrade/revocation, account suspension, and explicit session termination revoke tracked records transactionally; logout calls the backend revocation endpoint before local Supabase sign-out. UI role caching is short-lived and keyed to the authenticated user. A tracked revoked token cannot continue using protected backend endpoints even while its Supabase JWT remains cryptographically unexpired.

Residual limitation: when the client is offline or the logout request fails, local sign-out can complete without server-side revocation; the JWT may remain valid at Supabase until expiry, but privileged backend middleware still checks current role/profile and a tracked session when the migration is applied. Untracked sessions created before deployment are registered on their next protected request. The implementation does not claim native Supabase JWT revocation.

## Audit behavior

`security_audit_logs` is append-only for application/API roles (ordinary Admin cannot select, update, or delete it; SELECT is Super Admin-only). Role changes, permission-map changes, role-based session invalidation, account suspension/restoration, session revocation/logout, and legacy application audit inserts are recorded by database triggers/RPCs. The backend also records exam deletion/publication, question review/status/deletion, payment parser and payment approval/rejection, plan/coupon/entitlement/marketplace changes using actor and resource identifiers only. It does not include bearer tokens or full request payloads. Legacy event mirroring deliberately omits legacy `details` JSON.

This is not cryptographic tamper-proof storage: a sufficiently privileged database owner can still modify the database. Do not describe it as cryptographically immutable.

## Registration and compatibility

Live trigger metadata verified that `auth.users` inserts a profile and a profile trigger assigns an active `student` role. The trigger does not copy a client-supplied role. No identity-level profile data was read; production role assignments remain unchanged. Existing valid assignments are preserved, unknown role values are not silently elevated, and a multi-active-role condition aborts the migration for manual review.

## Verification

Run from each repository root:

```sh
# Backend
npm test
npm run build

# Admin UI
npm run build

# Student frontend
npm run build
```

The legacy admin-server source is under `parapoth-admin/clear` and has no independent package manifest. It was checked with TypeScript against the installed backend dependency/type toolchain using a temporary, untracked config. A successful type check does not replace a production build of that server.

The migration ran successfully in production, and read-only catalog checks verified both new security tables have RLS enabled, the caller-authorized RPCs are security-definer with an empty fixed search path, authenticated callers can execute them, and `service_role` cannot. Post-deployment Supabase security advisors did not flag either new table as RLS-enabled-without-policy. Database authorization/trigger behavior was not exercised against a disposable Postgres/Supabase instance. Continue to use isolated test identities to verify role assignment boundaries, last-Super-Admin safeguards, append-only audit behavior, account status, and session revocation; never run destructive tests against production identities.

## Rollout and required environment

Caller-scoped RPC clients require `SUPABASE_URL` and `SUPABASE_ANON_KEY` plus the verified request bearer token. Existing server-only service-role credentials remain backend-only and are not used by these authorization RPC clients. Do not expose them in the browser bundle.

## Post-deployment verification and remaining actions

The migration is applied and recorded as `20261024075947`; its checked-in filename now matches that ledger version to avoid treating an already-applied migration as pending. The rename changed no SQL and no database command was run. Read-only checks verified the role assignments remain 1 Admin, 2 Students, and 0 Super Admins; the permission-map counts are present; both security tables have RLS enabled; and all seven caller-authorized RPCs have fixed empty `search_path`, authenticated execute grants, and no service-role execute grant. Backend and student frontend CI completed successfully. The admin repository returned no GitHub Actions run. The local backend test/build, admin build, student build, and legacy-server type check had passed before the `main` pushes.

The security advisor reports existing project findings, including two pre-existing functions with mutable search paths and disabled leaked-password protection; these were not changed by this RBAC release. It also reports expected authenticated-executable SECURITY DEFINER RPC warnings—the new RPCs perform explicit caller/role checks and are not executable by `service_role`. Performance advice includes many unindexed foreign keys across the existing schema and two new session-table foreign keys; no additional index migration was included in this release.

The first Super Admin bootstrap remains pending and must be a separate, owner-controlled operation after an explicit identity decision. No connected Render/Vercel hosting deployment was independently verified. Continue with isolated integration tests and authenticated/unauthenticated smoke tests, without changing real user roles, then select a Super Admin only through the documented approval process.
