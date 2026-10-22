-- Student question bank RPC.
--
-- This file mirrors a change that has ALREADY been applied to the live
-- Supabase project. It is committed only so the repository's migration history
-- matches production; it must not be re-applied.
--
-- The `questions` table has RLS with an admin-only policy, so students cannot
-- select it directly. This function is the approved read path: it returns
-- published, active, non-exam questions with premium rows redacted (empty body,
-- no options, no explanation) when the caller has no premium access. The answer
-- key is never included.

create or replace function public.get_student_question_bank(
  p_subject_id text default null,
  p_chapter_id text default null,
  p_topic_id text default null,
  p_sort text default 'newest'
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_access jsonb;
  v_has_premium boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_access := public.get_user_access(v_uid);
  v_has_premium := coalesce((v_access->>'premium')::boolean, false)
    or coalesce((v_access->>'unlimited_all')::boolean, false);

  return query
  select jsonb_build_object(
    'id', r.id,
    'type', r.type,
    'difficulty_level', r.difficulty_level,
    'source_type', r.source_type,
    'tags', coalesce(to_jsonb(r.tags), '[]'::jsonb),
    'exam_references', coalesce(r.exam_references, '[]'::jsonb),
    'subject_id', r.subject_id,
    'chapter_id', r.chapter_id,
    'topic_id', r.topic_id,
    'total_attempts', coalesce(r.total_attempts, 0),
    'correct_attempts', coalesce(r.correct_attempts, 0),
    'created_at', r.created_at,
    'body',
      case
        when r.locked then '{}'::jsonb
        else jsonb_strip_nulls(
          jsonb_build_object(
            'text_bn', case when jsonb_typeof(r.body -> 'text_bn') = 'string' then r.body -> 'text_bn' end,
            'text_en', case when jsonb_typeof(r.body -> 'text_en') = 'string' then r.body -> 'text_en' end,
            'image_url', case when jsonb_typeof(r.body -> 'image_url') = 'string' then r.body -> 'image_url' end
          )
        )
      end,
    'options',
      case
        when r.locked or jsonb_typeof(r.options) <> 'array' then '[]'::jsonb
        else (
          select coalesce(
            jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'id', case when jsonb_typeof(o.item -> 'id') in ('string', 'number') then o.item -> 'id' end,
                  'text_bn', case when jsonb_typeof(o.item -> 'text_bn') = 'string' then o.item -> 'text_bn' end,
                  'text_en', case when jsonb_typeof(o.item -> 'text_en') = 'string' then o.item -> 'text_en' end
                )
              )
              order by o.ord
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(r.options) with ordinality as o(item, ord)
        )
      end,
    'explanation', case when r.locked then null else to_jsonb(r.explanation) end,
    'subjects', jsonb_build_object(
      'id', r.s_id,
      'name_bn', r.s_name_bn,
      'name_en', r.s_name_en,
      'slug', r.s_slug,
      'is_premium', r.s_prem,
      'sequence', r.s_seq
    ),
    'chapters', case when r.c_id is null then null else jsonb_build_object(
      'id', r.c_id,
      'subject_id', r.subject_id,
      'name_bn', r.c_name_bn,
      'name_en', r.c_name_en,
      'slug', r.c_slug,
      'is_premium', r.c_prem,
      'sequence', r.c_seq
    ) end,
    'topics', case when r.t_id is null then null else jsonb_build_object(
      'id', r.t_id,
      'chapter_id', r.chapter_id,
      'name_bn', r.t_name_bn,
      'name_en', r.t_name_en,
      'slug', r.t_slug,
      'is_premium', r.t_prem,
      'sequence', r.t_seq,
      'total_questions', r.t_total
    ) end
  )
  from (
    select
      q.*,
      s.id as s_id,
      s.name_bn as s_name_bn,
      s.name_en as s_name_en,
      s.slug as s_slug,
      s.is_premium as s_prem,
      s.sequence as s_seq,
      c.id as c_id,
      c.name_bn as c_name_bn,
      c.name_en as c_name_en,
      c.slug as c_slug,
      c.is_premium as c_prem,
      c.sequence as c_seq,
      t.id as t_id,
      t.name_bn as t_name_bn,
      t.name_en as t_name_en,
      t.slug as t_slug,
      t.is_premium as t_prem,
      t.sequence as t_seq,
      t.total_questions as t_total,
      (
        (
          coalesce(s.is_premium, false)
          or coalesce(c.is_premium, false)
          or coalesce(t.is_premium, false)
        )
        and not v_has_premium
      ) as locked
    from public.questions q
    join public.subjects s on s.id = q.subject_id and s.is_active is true
    left join public.chapters c on c.id = q.chapter_id
    left join public.topics t on t.id = q.topic_id
    where q.status = 'published'
      and q.is_active is true
      and q.deleted_at is null
      and (q.chapter_id is null or c.is_active is true)
      and (q.topic_id is null or t.is_active is true)
      and (p_subject_id is null or p_subject_id = '' or q.subject_id = p_subject_id)
      and (p_chapter_id is null or p_chapter_id = '' or q.chapter_id = p_chapter_id)
      and (p_topic_id is null or p_topic_id = '' or q.topic_id = p_topic_id)
      and not exists (
        select 1
        from public.exam_paper_questions epq
        join public.exam_papers ep on ep.id = epq.exam_id
        where epq.question_id = q.id
          and (ep.end_time is null or ep.end_time > now())
      )
    order by
      case when p_sort = 'oldest' then q.created_at end asc nulls last,
      case when p_sort = 'most_attempted' then q.total_attempts end desc nulls last,
      case when p_sort = 'least_attempted' then q.total_attempts end asc nulls last,
      q.created_at desc
    limit 100
  ) r;
end;
$$;

revoke all on function public.get_student_question_bank(text, text, text, text) from public, anon;

grant execute on function public.get_student_question_bank(text, text, text, text) to authenticated;
