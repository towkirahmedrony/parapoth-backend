-- Phase 2: server-side exam attempt lifecycle and idempotent submission.
--
-- This migration is NOT applied automatically. It must be reviewed and applied
-- to the target Supabase project before the Phase 2 attempt enforcement becomes
-- active. Until it is applied, the source-side code fails closed for attempts
-- whose deadline cannot be resolved (see exam.attempt.service.ts).
--
-- Assumptions are based on the generated src/types/database.type.ts:
--   exam_progress(id, user_id, exam_id, answers_draft, current_question_index,
--                 time_remaining, last_updated_at)
--   exam_history(id, user_id, exam_id, score, total_marks, details_json, ...)

alter table public.exam_progress
  add column if not exists kind text not null default 'exam',
  add column if not exists status text not null default 'in_progress',
  add column if not exists started_at timestamptz,
  add column if not exists deadline_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists exam_history_id uuid,
  add column if not exists awarded_xp integer not null default 0,
  add column if not exists question_ids jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exam_progress_status_check'
  ) then
    alter table public.exam_progress
      add constraint exam_progress_status_check
      check (status in ('in_progress', 'submitted', 'expired', 'finalized'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'exam_progress_kind_check'
  ) then
    alter table public.exam_progress
      add constraint exam_progress_kind_check
      check (kind in ('exam', 'practice'));
  end if;
end $$;

-- One active attempt per (user, exam). Submitted/expired rows do not conflict,
-- so a legitimate retake can create a fresh attempt row.
create unique index if not exists exam_progress_active_exam_attempt_uidx
  on public.exam_progress (user_id, exam_id)
  where status = 'in_progress' and exam_id is not null;

create index if not exists exam_progress_user_exam_idx
  on public.exam_progress (user_id, exam_id);

-- Durable idempotency: one exam_history row per attempt. Legacy rows keep a
-- null attempt_id and are unaffected.
alter table public.exam_history
  add column if not exists attempt_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exam_history_attempt_id_fkey'
  ) then
    alter table public.exam_history
      add constraint exam_history_attempt_id_fkey
      foreign key (attempt_id) references public.exam_progress (id) on delete set null;
  end if;
end $$;

create unique index if not exists exam_history_attempt_id_uidx
  on public.exam_history (attempt_id)
  where attempt_id is not null;

-- Existing in-progress rows have no authoritative start/deadline. They are left
-- untouched; the application treats a missing deadline as expired so a stale
-- attempt cannot be submitted or resumed. Operators may rebuild those rows by
-- clearing/restarting them after review.
--
-- exam_history.attempt_id is the durable idempotency key: the partial unique
-- index guarantees at most one result per attempt even if two API instances
-- race on the same submission.
