import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * Regression coverage for the exam hardening work:
 *
 *   B7  admin punishment scoping, real session recovery, live progress
 *   B8  teacher review workflow and canonical content hashing
 *   B9  PostgREST filter safety
 *   B14 server-side community challenge scoring
 */

type Row = Record<string, any>;

const state: Record<string, Row[]> = {
  exam_progress: [],
  exam_history: [],
  profiles: [],
  group_battles: [],
  exam_paper_questions: [],
  questions: [],
  audit_logs: [],
};

let seq = 0;

const matches = (row: Row, filters: Row[], ranges: Row[]) => {
  for (const { column, value, negate } of filters) {
    const rowValue = row[column];
    const equal =
      value === null
        ? rowValue === null || rowValue === undefined
        : Array.isArray(value)
          ? value.map(String).includes(String(rowValue))
          : String(rowValue) === String(value);

    if (negate ? equal : !equal) return false;
  }

  for (const range of ranges) {
    const actual = Date.parse(String(row[range.column]));
    const boundary = Date.parse(String(range.value));

    if (!Number.isFinite(actual)) return false;
    if (range.op === 'gt' && !(actual > boundary)) return false;
    if (range.op === 'lt' && !(actual < boundary)) return false;
    if (range.op === 'gte' && !(actual >= boundary)) return false;
    if (range.op === 'lte' && !(actual <= boundary)) return false;
  }

  return true;
};

const createBuilder = (table: string) => {
  const filters: Row[] = [];
  const ranges: Row[] = [];
  let inserted: Row[] | null = null;
  let update: Row | null = null;
  let limitCount: number | null = null;
  let orderSpec: { column: string; ascending: boolean } | null = null;

  const rows = () => (state[table] = state[table] || []);

  const resolve = (single: boolean) => {
    if (update) {
      const matched = rows().filter((row) => matches(row, filters, ranges));
      matched.forEach((row) => Object.assign(row, update));
      return { data: single ? matched[0] ?? null : matched, error: null };
    }

    if (inserted) {
      const created = inserted.map((row) => {
        seq += 1;
        return { id: row.id ?? `${table}-${seq}`, ...row };
      });
      rows().push(...created);
      return { data: single ? created[0] ?? null : created, error: null };
    }

    let result = rows().filter((row) => matches(row, filters, ranges));

    if (orderSpec) {
      const { column, ascending } = orderSpec;
      result = result.slice().sort((a, b) => {
        const left = a[column] ?? '';
        const right = b[column] ?? '';
        return ascending
          ? String(left).localeCompare(String(right))
          : String(right).localeCompare(String(left));
      });
    }

    if (limitCount !== null) result = result.slice(0, limitCount);

    return { data: single ? result[0] ?? null : result, error: null };
  };

  const builder: any = {
    select: () => builder,
    eq: (column: string, value: any) => {
      filters.push({ column, value, negate: false });
      return builder;
    },
    in: (column: string, values: any[]) => {
      filters.push({ column, value: values, negate: false });
      return builder;
    },
    is: (column: string, value: any) => {
      filters.push({ column, value, negate: false });
      return builder;
    },
    not: (column: string, _operator: string, value: any) => {
      filters.push({ column, value, negate: true });
      return builder;
    },
    gt: (column: string, value: any) => {
      ranges.push({ column, value, op: 'gt' });
      return builder;
    },
    lt: (column: string, value: any) => {
      ranges.push({ column, value, op: 'lt' });
      return builder;
    },
    gte: (column: string, value: any) => {
      ranges.push({ column, value, op: 'gte' });
      return builder;
    },
    lte: (column: string, value: any) => {
      ranges.push({ column, value, op: 'lte' });
      return builder;
    },
    or: () => builder,
    order: (column: string, options?: { ascending?: boolean }) => {
      orderSpec = { column, ascending: options?.ascending !== false };
      return builder;
    },
    limit: (count: number) => {
      limitCount = count;
      return builder;
    },
    insert: (rowsToInsert: Row | Row[]) => {
      inserted = Array.isArray(rowsToInsert) ? rowsToInsert : [rowsToInsert];
      return builder;
    },
    update: (values: Row) => {
      update = values;
      return builder;
    },
    delete: () => builder,
    maybeSingle: async () => resolve(true),
    single: async () => resolve(true),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolve(false)).then(onFulfilled, onRejected),
  };

  return builder;
};

const fakeSupabase = {
  from: (table: string) => createBuilder(table),
  rpc: async () => ({ data: null, error: null }),
};

const require = createRequire(__filename);
const supabaseConfigPath = require.resolve('../../config/supabase');

require.cache[supabaseConfigPath] = {
  id: supabaseConfigPath,
  filename: supabaseConfigPath,
  loaded: true,
  exports: { supabase: fakeSupabase },
} as any;

const { ExamAdminService } = require('./exams.admin.service');
const { getChallenge, submitChallenge } = require('../community/community.user.service');
const {
  buildQuestionContentHash,
  decideQuestionWrite,
} = require('../content/question.policy');
const {
  buildIdMatchClause,
  escapeLikeValue,
  normalizeSearchTerm,
} = require('../../lib/utils/search');

const MINUTE = 60_000;

const seedChallenge = () => {
  state.questions.push(
    {
      id: 'q-1',
      status: 'published',
      is_active: true,
      deleted_at: null,
      type: 'mcq',
      difficulty_level: 'easy',
      body: { text_bn: 'প্রশ্ন এক', text_en: 'Question one' },
      options: [
        { id: 'o-1a', text_bn: 'ক', is_correct: true },
        { id: 'o-1b', text_bn: 'খ', is_correct: false },
      ],
    },
    {
      id: 'q-2',
      status: 'published',
      is_active: true,
      deleted_at: null,
      type: 'mcq',
      difficulty_level: 'easy',
      body: { text_bn: 'প্রশ্ন দুই', text_en: 'Question two' },
      options: [
        { id: 'o-2a', text_bn: 'গ', is_correct: false },
        { id: 'o-2b', text_bn: 'ঘ', is_correct: true },
      ],
    }
  );

  state.exam_paper_questions.push(
    { exam_id: 'paper-1', question_id: 'q-1', sequence: 1 },
    { exam_id: 'paper-1', question_id: 'q-2', sequence: 2 }
  );

  state.profiles.push(
    { id: 'user-1', full_name: 'Challenger', current_group_id: 'group-1' },
    { id: 'user-2', full_name: 'Opponent', current_group_id: 'group-1' }
  );

  state.group_battles.push({
    id: 'battle-1',
    exam_id: 'paper-1',
    group_id: 'group-1',
    initiated_by: 'user-1',
    status: 'pending',
    scores_snapshot: { 'user-1': 0, 'user-2': 0 },
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 60 * MINUTE).toISOString(),
    winner_id: null,
  });
};

beforeEach(() => {
  seq = 0;
  Object.keys(state).forEach((key) => {
    state[key] = [];
  });
});

// ---------------------------------------------------------------- B7 admin

test('B7: zero_marks requires an exam id and never zeroes unrelated exams', async () => {
  state.exam_history.push(
    { id: 'h-1', user_id: 'user-1', exam_id: 'exam-1', score: 80, status: 'passed' },
    { id: 'h-2', user_id: 'user-1', exam_id: 'exam-2', score: 70, status: 'passed' }
  );

  await assert.rejects(
    ExamAdminService.punishUser({ userId: 'user-1', action: 'zero_marks' }, 'admin-1'),
    (error: any) => error.status === 400 && /examId/.test(error.message)
  );

  // Nothing changed by the rejected call.
  assert.equal(state.exam_history[0].score, 80);

  const result = await ExamAdminService.punishUser(
    { userId: 'user-1', action: 'zero_marks', examId: 'exam-1' },
    'admin-1'
  );

  assert.equal(result.affected, 1);
  assert.equal(state.exam_history[0].score, 0);
  assert.equal(state.exam_history[0].status, 'fraud_detected');
  // The unrelated exam result is untouched.
  assert.equal(state.exam_history[1].score, 70);
  assert.equal(state.exam_history[1].status, 'passed');
});

test('B7: unknown punishment actions are rejected', async () => {
  await assert.rejects(
    ExamAdminService.punishUser({ userId: 'user-1', action: 'delete_everything' } as any),
    (error: any) => error.status === 400
  );
});

test('B7: session recovery extends an expired attempt from max(now, deadline)', async () => {
  const previousDeadline = new Date(Date.now() - 10 * MINUTE).toISOString();

  state.exam_progress.push({
    id: 'attempt-1',
    user_id: 'user-1',
    exam_id: 'exam-1',
    kind: 'exam',
    status: 'expired',
    deadline_at: previousDeadline,
    exam_history_id: null,
  });

  const result = await ExamAdminService.recoverSession('attempt-1', 10, 'admin-1');

  assert.equal(result.status, 'in_progress');
  assert.equal(result.extended_by_minutes, 10);

  const stored = state.exam_progress[0];
  assert.equal(stored.status, 'in_progress');

  const expected = Date.now() + 10 * MINUTE;
  const actual = Date.parse(stored.deadline_at);
  assert.ok(Math.abs(actual - expected) < 5_000, `deadline ${stored.deadline_at} not ~now+10m`);
  assert.ok(result.seconds_remaining > 590);
});

test('B7: recovery validates the extension and refuses completed attempts', async () => {
  state.exam_progress.push(
    {
      id: 'attempt-1',
      user_id: 'user-1',
      exam_id: 'exam-1',
      kind: 'exam',
      status: 'in_progress',
      deadline_at: new Date(Date.now() + 5 * MINUTE).toISOString(),
      exam_history_id: null,
    },
    {
      id: 'attempt-2',
      user_id: 'user-2',
      exam_id: 'exam-1',
      kind: 'exam',
      status: 'submitted',
      deadline_at: new Date(Date.now() + 5 * MINUTE).toISOString(),
      exam_history_id: 'h-2',
    }
  );

  for (const invalid of [0, 61, 1.5, 'ten']) {
    await assert.rejects(
      ExamAdminService.recoverSession('attempt-1', invalid, 'admin-1'),
      (error: any) => error.status === 400
    );
  }

  const before = state.exam_progress[0].deadline_at;
  const extended = await ExamAdminService.recoverSession('attempt-1', 5, 'admin-1');
  assert.equal(extended.extended_by_minutes, 5);
  // Existing time is preserved, not restarted.
  assert.ok(Date.parse(extended.deadline_at) > Date.parse(before));

  await assert.rejects(
    ExamAdminService.recoverSession('attempt-2', 5, 'admin-1'),
    (error: any) => error.status === 409
  );
});

test('B7: live progress only reports in-progress attempts with a derived deadline', async () => {
  state.exam_progress.push(
    {
      id: 'attempt-1',
      user_id: 'user-1',
      exam_id: 'exam-1',
      status: 'in_progress',
      deadline_at: new Date(Date.now() + 2 * MINUTE).toISOString(),
      time_remaining: 99999,
      current_question_index: 3,
      last_updated_at: new Date().toISOString(),
    },
    {
      id: 'attempt-2',
      user_id: 'user-2',
      exam_id: 'exam-1',
      status: 'submitted',
      deadline_at: new Date(Date.now() + 2 * MINUTE).toISOString(),
      time_remaining: 10,
      current_question_index: 5,
      last_updated_at: new Date().toISOString(),
    }
  );

  const live = await ExamAdminService.getLiveProgress('exam-1');

  assert.equal(live.length, 1);
  assert.equal(live[0].status, 'in_progress');
  assert.ok(live[0].deadline_at);
  assert.ok(live[0].seconds_remaining <= 120 && live[0].seconds_remaining > 110);
});

// ------------------------------------------------- B8 content write policy

test('B8: teacher writes are always pending and cannot touch moderation fields', () => {
  const decision = decideQuestionWrite({
    role: 'teacher',
    mode: 'create',
    body: {
      body: { text_bn: 'প্রশ্ন' },
      options: [{ id: 'a', is_correct: true }],
      subject_id: 'subject-1',
      status: 'published',
      is_active: true,
      created_by: 'someone-else',
      approved_by: 'someone-else',
      content_hash: 'forged',
      total_attempts: 999,
    },
  });

  assert.equal(decision.payload.status, 'pending');
  assert.equal(decision.payload.is_active, undefined);
  assert.equal(decision.payload.created_by, undefined);
  assert.equal(decision.payload.approved_by, undefined);
  assert.equal(decision.payload.content_hash, undefined);
  assert.equal(decision.payload.total_attempts, undefined);
});

test('B8: a teacher edit that changes content returns the question to pending', () => {
  const contentEdit = decideQuestionWrite({
    role: 'teacher',
    mode: 'update',
    body: { body: { text_bn: 'নতুন প্রশ্ন' }, status: 'published' },
  });

  assert.equal(contentEdit.payload.status, 'pending');
  assert.equal(contentEdit.requiresReview, true);

  const metadataOnly = decideQuestionWrite({
    role: 'teacher',
    mode: 'update',
    body: { tags: ['tag-1'], status: 'published' },
  });

  assert.equal(metadataOnly.payload.status, undefined);
  assert.equal(metadataOnly.requiresReview, false);
});

test('B8: admins keep the publishing workflow', () => {
  const decision = decideQuestionWrite({
    role: 'admin',
    mode: 'create',
    body: { body: { text_bn: 'প্রশ্ন' }, subject_id: 'subject-1', status: 'published' },
  });

  assert.equal(decision.payload.status, 'published');
});

test('B8: single and bulk paths hash equivalent content identically', () => {
  const content = {
    subject_id: 'subject-1',
    chapter_id: 'chapter-1',
    type: 'mcq',
    body: { text_bn: 'একই প্রশ্ন' },
    options: [{ id: 'a', text_bn: 'ক', is_correct: true }],
    difficulty_level: 'easy',
  };

  const single = buildQuestionContentHash({ ...content, created_by: 'user-1', status: 'pending' });
  const bulk = buildQuestionContentHash({ ...content, created_by: 'user-2', status: 'approved' });
  const different = buildQuestionContentHash({ ...content, body: { text_bn: 'অন্য প্রশ্ন' } });

  assert.equal(single, bulk);
  assert.notEqual(single, different);
});

// -------------------------------------------------------- B9 filter safety

test('B9: search input cannot inject PostgREST filter syntax', () => {
  for (const malicious of ['a,b', 'a(b', 'a)b', 'a\\b', 'x'.repeat(65), 'a\u0000b']) {
    assert.throws(() => normalizeSearchTerm(malicious), /unsupported|at most/i);
  }

  assert.equal(normalizeSearchTerm('  algebra  '), 'algebra');
  assert.equal(escapeLikeValue('50%_off'), '50\\%\\_off');
});

test('B9: id matching is exact and only applies to UUID input', () => {
  const uuid = '3f1c2b9e-1a2b-4c3d-8e4f-1234567890ab';

  assert.equal(buildIdMatchClause('id', uuid), `id.eq.${uuid}`);
  assert.equal(buildIdMatchClause('id', 'algebra'), null);
  assert.equal(buildIdMatchClause('id', uuid.slice(0, 8)), null);
});

// ------------------------------------------- B14 community challenge scoring

test('B14: challenge questions never expose answer keys', async () => {
  seedChallenge();

  const challenge = await getChallenge('user-1', 'battle-1');
  const serialized = JSON.stringify(challenge);

  assert.equal(challenge.questions.length, 2);
  assert.ok(challenge.questions[0].text.includes('প্রশ্ন'));
  assert.equal(serialized.includes('isCorrect'), false);
  assert.equal(serialized.includes('is_correct'), false);
  assert.equal(challenge.opponent.name, 'Opponent');
});

test('B14: client-calculated scores are rejected', async () => {
  seedChallenge();

  await assert.rejects(
    submitChallenge('user-1', 'battle-1', {
      challenger_score: 2,
      challenger_time_taken: 1,
      answers: { 'q-1': 'o-1a' },
    }),
    /selected answers only/
  );
});

test('B14: the server grades answers and duplicate submissions are idempotent', async () => {
  seedChallenge();

  const first = await submitChallenge('user-1', 'battle-1', {
    answers: { 'q-1': 'o-1a', 'q-2': 'o-2a' },
  });

  assert.equal(first.score, 1);
  assert.equal(first.total, 2);
  assert.equal(first.duplicate, false);
  assert.equal(first.time_taken >= 59, true);

  const battle = state.group_battles[0];
  assert.equal(battle.scores_snapshot['user-1'], 1);
  assert.equal(battle.status, 'ongoing');

  const second = await submitChallenge('user-1', 'battle-1', {
    answers: { 'q-1': 'o-1a', 'q-2': 'o-2b' },
  });

  assert.equal(second.duplicate, true);
  assert.equal(second.score, 1);
  assert.equal(state.group_battles[0].scores_snapshot['user-1'], 1);
});

test('B14: answers must reference options of the submitted questions', async () => {
  seedChallenge();

  await assert.rejects(
    submitChallenge('user-1', 'battle-1', { answers: { 'q-1': 'o-2b' } }),
    /Option does not belong/
  );

  await assert.rejects(
    submitChallenge('user-1', 'battle-1', { answers: { 'q-404': 'o-1a' } }),
    /does not belong to this challenge/
  );
});

test('B14: non-participants cannot read or submit a challenge', async () => {
  seedChallenge();

  await assert.rejects(getChallenge('user-3', 'battle-1'), (error: any) => error.status === 403);
  await assert.rejects(
    submitChallenge('user-3', 'battle-1', { answers: {} }),
    (error: any) => error.status === 403
  );
});
