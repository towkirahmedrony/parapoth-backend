import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * Freemium quota enforcement for the exam-start lifecycle.
 *
 * The Supabase client is faked at the transport boundary, including a
 * deterministic implementation of `consume_quota` / `refund_quota` /
 * `get_user_access`, so the real ExamAttemptService runs without credentials.
 *
 * The fake models the documented database contract: consumption is idempotent
 * per (user, feature, reference_id) and the daily limit is enforced by the
 * function, not by the application.
 */

type Row = Record<string, any>;

const DAILY_LIMIT = 3;
const RESET_AT = '2026-10-22T18:00:00.000Z'; // next midnight in Asia/Dhaka

const state: {
  examPapers: Row[];
  examPaperQuestions: Row[];
  questions: Row[];
  attempts: Row[];
  usage: Row[];
  access: Row;
  rpcCalls: { name: string; args: Row }[];
  failInsert: Row | null;
  /** Row committed by a concurrent request, revealed when our insert collides. */
  commitOnInsert: Row | null;
  limit: number;
} = {
  examPapers: [],
  examPaperQuestions: [],
  questions: [],
  attempts: [],
  usage: [],
  access: { tier: 'free', premium: false, source: 'free', unlimited_all: false, unlimited_features: [] },
  rpcCalls: [],
  failInsert: null,
  commitOnInsert: null,
  limit: DAILY_LIMIT,
};

let seq = 0;

const matches = (row: Row, filters: Record<string, any>) =>
  Object.entries(filters).every(([column, value]) => {
    if (Array.isArray(value)) return value.map(String).includes(String(row[column]));
    if (value === null) return row[column] === null || row[column] === undefined;
    return String(row[column]) === String(value);
  });

const usedToday = (userId: string, feature: string) =>
  state.usage.filter(
    (event) => event.user_id === userId && event.feature === feature && !event.refunded_at
  ).length;

const quotaResponse = (userId: string, feature: string, referenceId: string) => {
  const already = state.usage.find(
    (event) =>
      event.user_id === userId &&
      event.feature === feature &&
      event.reference_id === referenceId &&
      !event.refunded_at
  );

  const used = usedToday(userId, feature);

  if (already) {
    return {
      allowed: true,
      metered: true,
      unlimited: false,
      used,
      limit: state.limit,
      remaining: Math.max(0, state.limit - used),
      reset_at: RESET_AT,
      reason: 'already_counted',
      idempotent: true,
    };
  }

  if (used >= state.limit) {
    return {
      allowed: false,
      metered: true,
      unlimited: false,
      used,
      limit: state.limit,
      remaining: 0,
      reset_at: RESET_AT,
      reason: 'daily_limit_reached',
      idempotent: false,
    };
  }

  state.usage.push({
    user_id: userId,
    feature,
    reference_id: referenceId,
    usage_date: new Date().toISOString(),
    refunded_at: null,
  });

  return {
    allowed: true,
    metered: true,
    unlimited: false,
    used: used + 1,
    limit: state.limit,
    remaining: Math.max(0, state.limit - used - 1),
    reset_at: RESET_AT,
    reason: 'consumed',
    idempotent: false,
  };
};

const createBuilder = (table: string) => {
  const filters: Record<string, any> = {};
  let inserted: Row[] | null = null;
  let update: Row | null = null;

  const resolve = (mode: 'many' | 'single') => {
    if (table === 'exam_papers') {
      const row = state.examPapers.find((item) => matches(item, filters));
      return { data: mode === 'single' ? row ?? null : row ? [row] : [], error: null };
    }

    if (table === 'exam_paper_questions') {
      return { data: state.examPaperQuestions.filter((item) => matches(item, filters)), error: null };
    }

    if (table === 'questions') {
      return { data: state.questions.filter((item) => matches(item, filters)), error: null };
    }

    if (table === 'exam_progress') {
      if (inserted) {
        if (state.failInsert) {
          const error = state.failInsert;
          state.failInsert = null;
          // Model the losing side of a race: the other request commits between
          // our "no active attempt" read and our insert.
          if (state.commitOnInsert) {
            state.attempts.push(state.commitOnInsert);
            state.commitOnInsert = null;
          }
          return { data: null, error };
        }
        seq += 1;
        const row = {
          id: `attempt-${seq}`,
          answers_draft: {},
          current_question_index: 0,
          submitted_at: null,
          exam_history_id: null,
          last_updated_at: new Date().toISOString(),
          ...inserted[0],
        };
        state.attempts.push(row);
        return { data: mode === 'single' ? row : [row], error: null };
      }

      if (update) {
        const rows = state.attempts.filter((item) => matches(item, filters));
        rows.forEach((row) => Object.assign(row, update));
        return { data: rows, error: null };
      }

      const rows = state.attempts.filter((item) => matches(item, filters));
      return { data: mode === 'single' ? rows[0] ?? null : rows, error: null };
    }

    return { data: mode === 'single' ? null : [], error: null };
  };

  const builder: any = {
    select: () => builder,
    eq: (column: string, value: any) => {
      filters[column] = value;
      return builder;
    },
    in: (column: string, values: any[]) => {
      filters[column] = values;
      return builder;
    },
    is: (column: string, value: any) => {
      filters[column] = value;
      return builder;
    },
    gt: () => builder,
    gte: () => builder,
    lte: () => builder,
    or: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: (rows: Row[]) => {
      inserted = rows;
      return builder;
    },
    update: (values: Row) => {
      update = values;
      return builder;
    },
    delete: () => builder,
    maybeSingle: async () => resolve('single'),
    single: async () => resolve('single'),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolve('many')).then(onFulfilled, onRejected),
  };

  return builder;
};

const fakeSupabase = {
  from: (table: string) => createBuilder(table),
  rpc: async (name: string, args: Row) => {
    state.rpcCalls.push({ name, args });

    if (name === 'get_user_access') {
      return { data: { ...state.access }, error: null };
    }

    if (name === 'consume_quota') {
      return {
        data: quotaResponse(args.p_user_id, args.p_feature, args.p_reference_id),
        error: null,
      };
    }

    if (name === 'refund_quota') {
      const event = state.usage.find(
        (item) =>
          item.user_id === args.p_user_id &&
          item.feature === args.p_feature &&
          item.reference_id === args.p_reference_id &&
          !item.refunded_at
      );

      if (event) event.refunded_at = new Date().toISOString();

      return { data: Boolean(event), error: null };
    }

    return { data: null, error: null };
  },
};

const require = createRequire(__filename);
const supabaseConfigPath = require.resolve('../../config/supabase');

require.cache[supabaseConfigPath] = {
  id: supabaseConfigPath,
  filename: supabaseConfigPath,
  loaded: true,
  exports: { supabase: fakeSupabase },
} as any;

const { ExamAttemptService, ExamAttemptError } = require('./exam.attempt.service');

const baseExam = (overrides: Row = {}) => ({
  id: 'exam-1',
  is_published: true,
  is_premium: false,
  duration_min: 30,
  start_time: null,
  end_time: null,
  default_negative_marks: 0.25,
  total_marks: 2,
  result_publish_time: null,
  ...overrides,
});

const isFreeLimitError = (error: any) =>
  error instanceof ExamAttemptError &&
  error.status === 403 &&
  error.code === 'FREE_LIMIT_REACHED' &&
  error.details?.feature === 'exam_start';

beforeEach(() => {
  seq = 0;
  state.examPapers = [baseExam()];
  state.examPaperQuestions = [
    { exam_id: 'exam-1', question_id: 'q-1', sequence: 1 },
    { exam_id: 'exam-1', question_id: 'q-2', sequence: 2 },
  ];
  state.questions = [
    { id: 'q-1', is_active: true, status: 'published', deleted_at: null },
    { id: 'q-2', is_active: true, status: 'published', deleted_at: null },
  ];
  state.attempts = [];
  state.usage = [];
  state.rpcCalls = [];
  state.failInsert = null;
  state.limit = DAILY_LIMIT;
  state.access = {
    tier: 'free',
    premium: false,
    source: 'free',
    premium_expires_at: null,
    unlimited_all: false,
    unlimited_features: [],
  };
});

test('quota is consumed exactly once per new attempt', async () => {
  const attempt = await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  assert.equal(state.usage.length, 1);
  assert.equal(state.usage[0].reference_id, attempt.id);
  assert.equal(state.usage[0].feature, 'exam_start');
  assert.equal(usedToday('user-1', 'exam_start'), 1);
});

test('the fourth attempt in a day is denied with the documented quota error', async () => {
  await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  // Distinct attempts require distinct exams: one in-progress attempt per paper.
  const started: string[] = ['exam-1'];
  for (let index = 2; index <= 3; index += 1) {
    const examId = `exam-${index}`;
    state.examPapers.push(baseExam({ id: examId }));
    state.examPaperQuestions.push({ exam_id: examId, question_id: 'q-1', sequence: 1 });
    await ExamAttemptService.startExamAttempt('user-1', examId);
    started.push(examId);
  }

  assert.equal(usedToday('user-1', 'exam_start'), 3);

  state.examPapers.push(baseExam({ id: 'exam-4' }));
  state.examPaperQuestions.push({ exam_id: 'exam-4', question_id: 'q-1', sequence: 1 });

  await assert.rejects(
    ExamAttemptService.startExamAttempt('user-1', 'exam-4'),
    (error: any) => {
      assert.ok(isFreeLimitError(error), 'expected FREE_LIMIT_REACHED with details');
      // Details must mirror the authoritative database result, not constants.
      assert.equal(error.details.limit, DAILY_LIMIT);
      assert.equal(error.details.used, 3);
      assert.equal(error.details.reset_at, RESET_AT);
      return true;
    }
  );

  // The denied attempt is never created and never counted.
  assert.equal(state.attempts.length, 3);
  assert.equal(usedToday('user-1', 'exam_start'), 3);
});

test('resuming an attempt reuses the persisted id and does not consume quota again', async () => {
  const first = await ExamAttemptService.startExamAttempt('user-1', 'exam-1');
  const resumed = await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  assert.equal(resumed.id, first.id);
  assert.equal(state.attempts.length, 1);
  assert.equal(usedToday('user-1', 'exam_start'), 1);

  const resumeCalls = state.rpcCalls.filter(
    (call) => call.name === 'consume_quota' && call.args.p_reference_id === first.id
  );

  assert.equal(resumeCalls.length, 2);
  assert.equal(resumeCalls[0].args.p_feature, 'exam_start');
});

test('a failed attempt creation refunds the consumed quota exactly once', async () => {
  state.failInsert = { code: '23503', message: 'insert failed' };

  await assert.rejects(ExamAttemptService.startExamAttempt('user-1', 'exam-1'), /insert failed/);

  assert.equal(state.attempts.length, 0);
  assert.equal(state.usage.length, 1);
  assert.ok(state.usage[0].refunded_at, 'usage event must be refunded');
  assert.equal(usedToday('user-1', 'exam_start'), 0);
  assert.equal(state.usage.filter((event) => event.refunded_at).length, 1);
});

test('a concurrent start that loses the unique index resumes the winner and refunds its own quota', async () => {
  // The winner already consumed quota for its own reference id.
  state.usage.push({
    user_id: 'user-1',
    feature: 'exam_start',
    reference_id: 'attempt-winner',
    usage_date: new Date().toISOString(),
    refunded_at: null,
  });

  state.commitOnInsert = {
    id: 'attempt-winner',
    user_id: 'user-1',
    exam_id: 'exam-1',
    kind: 'exam',
    status: 'in_progress',
    started_at: new Date().toISOString(),
    deadline_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    submitted_at: null,
    answers_draft: {},
    current_question_index: 0,
    question_ids: ['q-1', 'q-2'],
    exam_history_id: null,
    last_updated_at: new Date().toISOString(),
  };

  state.failInsert = { code: '23505', message: 'duplicate key value violates unique constraint' };

  const result = await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  assert.equal(result.id, 'attempt-winner');
  assert.equal(state.attempts.length, 1);

  const loserEvent = state.usage.find((event) => event.reference_id !== 'attempt-winner');
  assert.ok(loserEvent, 'the losing request consumed its own reference id');
  assert.ok(loserEvent?.refunded_at, 'the losing request must refund its own consumption');
  assert.equal(usedToday('user-1', 'exam_start'), 1, 'only the winner stays counted');
});

test('a premium paper is refused for a free user without consuming quota', async () => {
  state.examPapers = [baseExam({ is_premium: true })];

  await assert.rejects(
    ExamAttemptService.startExamAttempt('user-1', 'exam-1'),
    (error: any) =>
      error instanceof ExamAttemptError &&
      error.status === 403 &&
      error.code === 'PREMIUM_REQUIRED' &&
      error.details?.resource === 'exam_paper'
  );

  assert.equal(state.attempts.length, 0);
  assert.equal(state.usage.length, 0);
  assert.equal(
    state.rpcCalls.some((call) => call.name === 'consume_quota'),
    false,
    'a rejected premium request must not consume quota'
  );
});

test('a premium paper starts for a user whose access payload reports premium', async () => {
  state.examPapers = [baseExam({ is_premium: true })];
  state.access = { ...state.access, tier: 'premium', premium: true, source: 'grant_user' };

  const attempt = await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  assert.equal(attempt.status, 'in_progress');
  assert.equal(state.usage.length, 1);
});

test('losing premium access blocks resuming an existing attempt', async () => {
  state.examPapers = [baseExam({ is_premium: true })];
  state.access = { ...state.access, tier: 'premium', premium: true, source: 'grant_user' };

  await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  state.access = { ...state.access, tier: 'free', premium: false, source: 'free' };

  await assert.rejects(
    ExamAttemptService.startExamAttempt('user-1', 'exam-1'),
    (error: any) => error instanceof ExamAttemptError && error.code === 'PREMIUM_REQUIRED'
  );

  assert.equal(usedToday('user-1', 'exam_start'), 1);
});

test('a non-premium paper is unaffected by premium access state', async () => {
  state.access = { ...state.access, tier: 'premium', premium: true, source: 'subscription' };

  const attempt = await ExamAttemptService.startExamAttempt('user-1', 'exam-1');

  assert.equal(attempt.status, 'in_progress');
});

test('unlimited access is reported by the database and never enforced client-side', async () => {
  state.limit = 1000;
  state.access = {
    ...state.access,
    tier: 'premium',
    premium: false,
    source: 'grant_user',
    unlimited_all: false,
    unlimited_features: ['exam_start'],
  };

  for (let index = 1; index <= 4; index += 1) {
    const examId = `exam-${index}`;
    state.examPapers.push(baseExam({ id: examId }));
    state.examPaperQuestions.push({ exam_id: examId, question_id: 'q-1', sequence: 1 });
    await ExamAttemptService.startExamAttempt('user-1', examId);
  }

  assert.equal(state.attempts.length, 4);
  assert.equal(usedToday('user-1', 'exam_start'), 4);
});
