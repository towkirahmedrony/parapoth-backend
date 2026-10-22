-- Exam security hardening.
--
-- This file mirrors a change that has ALREADY been applied to the live
-- Supabase project. It is committed only so the repository's migration history
-- matches production; it must not be re-applied.
--
-- 1. exam_progress is server-owned: the student-facing policy is dropped and
--    the anon/authenticated roles lose every table privilege. Only the backend
--    service role reads or writes attempts.
-- 2. exam_history.status accepts the four documented lifecycle values,
--    including fraud_detected.
-- 3. The rls_auto_enable() helper is no longer executable by API roles.

drop policy if exists "Users can manage their own data" on public.exam_progress;

revoke all on table public.exam_progress from anon, authenticated;

alter table public.exam_history
  drop constraint if exists exam_history_status_check;

alter table public.exam_history
  add constraint exam_history_status_check
  check (status = any (array['passed'::text, 'failed'::text, 'pending'::text, 'fraud_detected'::text]));

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
