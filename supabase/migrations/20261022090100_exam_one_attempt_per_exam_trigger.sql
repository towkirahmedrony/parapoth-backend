-- One attempt per exam.
--
-- This file mirrors a change that has ALREADY been applied to the live
-- Supabase project. It is committed only so the repository's migration history
-- matches production; it must not be re-applied.
--
-- The backend performs an application-level check for a better user
-- experience, but this trigger is the authoritative concurrency safeguard: any
-- new kind = 'exam' attempt for a (user, exam) pair that already has a result
-- is rejected with SQLSTATE P0409.

create or replace function public.enforce_single_exam_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'exam' and new.exam_id is not null then
    if exists (
      select 1
      from public.exam_history eh
      where eh.user_id = new.user_id
        and eh.exam_id = new.exam_id
    ) then
      raise exception 'already_attempted: this exam was already taken by the user'
        using errcode = 'P0409';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_single_exam_attempt() from public, anon, authenticated;

drop trigger if exists exam_progress_single_attempt on public.exam_progress;

create trigger exam_progress_single_attempt
  before insert on public.exam_progress
  for each row
  execute function public.enforce_single_exam_attempt();
