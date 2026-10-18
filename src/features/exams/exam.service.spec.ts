import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * Executes the real ExamUserService against an in-process fake Supabase client.
 * This covers the submit -> details_json -> result review contract without
 * touching a live database.
 */

type Row = Record<string, any>;

type FakeState = {
  questions: Row[];
  examPapers: Row[];
  history: Row[];
  insertedHistory: Row | null;
  insertedDetails: Row[];
  tableCalls: string[];
};

const state: FakeState = {
  questions: [],
  examPapers: [],
  history: [],
  insertedHistory: null,
  insertedDetails: [],
  tableCalls: [],
};

const createBuilder = (table: string) => {
  const filters: Record<string, any> = {};
  let inserted: Row[] | null = null;
  let rpcResult: Row | null = null;

  const resolveQuery = (mode: 'many' | 'single') => {
    state.tableCalls.push(`${table}:${mode}`);

    if (table === 'exam_papers') {
      const paper = state.examPapers.find((item) => String(item.id) === String(filters.id));
      return { data: mode === 'single' ? paper ?? null : paper ? [paper] : [], error: null };
    }

    if (table === 'questions') {
      const ids: string[] = Array.isArray(filters.id) ? filters.id.map(String) : [];
      const rows = state.questions.filter((item) => ids.includes(String(item.id)));
      return { data: rows, error: null };
    }

    if (table === 'exam_history') {
      if (inserted) {
        const row = { id: 'history-1', created_at: '2026-10-18T12:00:00.000Z', ...inserted[0] };
        state.insertedHistory = row;
        state.history.push(row);
        return { data: mode === 'single' ? row : [row], error: null };
      }

      const row = state.history.find(
        (item) =>
          String(item.id) === String(filters.id) &&
          String(item.user_id) === String(filters.user_id)
      );

      return { data: mode === 'single' ? row ?? null : row ? [row] : [], error: null };
    }

    if (table === 'exam_history_details') {
      if (inserted) {
        state.insertedDetails = inserted;
        return { data: inserted, error: null };
      }

      return { data: [], error: null };
    }

    if (table === 'app_configs') {
      return { data: mode === 'single' ? { value: { per_correct_answer: 5 } } : [], error: null };
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
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: (rows: Row[]) => {
      inserted = rows;
      return builder;
    },
    maybeSingle: async () => resolveQuery('single'),
    single: async () => resolveQuery('single'),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolveQuery(inserted ? 'many' : 'many')).then(onFulfilled, onRejected),
  };

  return builder;
};

const fakeSupabase = {
  from: (table: string) => createBuilder(table),
  rpc: async (_name: string, _args: Row) => ({ data: null, error: null }),
};

const require = createRequire(__filename);
const supabaseConfigPath = require.resolve('../../config/supabase');

// Intercept the service's Supabase dependency before it is loaded.
require.cache[supabaseConfigPath] = {
  id: supabaseConfigPath,
  filename: supabaseConfigPath,
  loaded: true,
  exports: { supabase: fakeSupabase },
} as any;

const { ExamUserService } = require('./exams.user.service');

const uuid = (suffix: string) => `8a1f0c2d-0000-4000-8000-00000000000${suffix}`;

const questions: Row[] = [
  {
    id: uuid('1'),
    type: 'MCQ',
    difficulty_level: 'easy',
    body: { text_bn: 'প্রশ্ন এক', text_en: 'Question one', image_url: null },
    options: [
      { id: uuid('a'), text_bn: 'ক', text_en: 'A', isCorrect: false },
      { id: uuid('b'), text_bn: 'খ', text_en: 'B', isCorrect: true },
    ],
    explanation: 'ব্যাখ্যা এক',
  },
  {
    id: uuid('2'),
    type: 'MCQ',
    difficulty_level: 'easy',
    body: { text_bn: 'প্রশ্ন দুই', text_en: 'Question two', image_url: null },
    options: [
      { id: uuid('c'), text_bn: 'গ', text_en: 'C', is_correct: true },
      { id: uuid('d'), text_bn: 'ঘ', text_en: 'D', is_correct: false },
    ],
    explanation: null,
  },
];

beforeEach(() => {
  state.questions = questions.map((question) => ({ ...question }));
  state.examPapers = [
    {
      id: 'exam-1',
      default_negative_marks: 0.25,
      total_marks: 2,
      result_publish_time: null,
    },
  ];
  state.history = [];
  state.insertedHistory = null;
  state.insertedDetails = [];
  state.tableCalls = [];
});

test('submit stores a reviewable question snapshot and grades UUID options correctly', async () => {
  const result = await ExamUserService.submitExamResult({
    exam_id: 'exam-1',
    user_id: 'user-1',
    answers: {
      [uuid('1')]: uuid('b'),
      [uuid('2')]: uuid('c'),
    },
    question_ids: [uuid('1'), uuid('2')],
    time_taken: 30,
  });

  assert.equal(result.correct_count, 2);
  assert.equal(result.wrong_count, 0);
  assert.equal(result.score, 2);

  const detailsJson = result.details_json;
  assert.equal(detailsJson.correct_answers_revealed, true);
  assert.equal(detailsJson.questions.length, 2);

  const firstQuestion = detailsJson.questions[0];
  assert.equal(firstQuestion.body.text_bn, 'প্রশ্ন এক');
  assert.equal(firstQuestion.options.length, 2);
  assert.equal(firstQuestion.options[1].isCorrect, true);
  assert.equal(firstQuestion.explanation, 'ব্যাখ্যা এক');

  assert.equal(detailsJson.details[0].selected_option_text, 'খ');
  assert.equal(detailsJson.details[1].is_correct, true);
  assert.equal(state.insertedDetails.length, 2);
  assert.equal(state.insertedDetails[0].selected_option, uuid('b'));
});

test('wrong answers are graded against the option identity, not numeric coercion', async () => {
  const result = await ExamUserService.submitExamResult({
    exam_id: 'exam-1',
    user_id: 'user-1',
    answers: { [uuid('1')]: uuid('a') },
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.correct_count, 0);
  assert.equal(result.wrong_count, 1);
  assert.equal(result.score, 0);
  assert.equal(result.details_json.details[0].is_correct, false);
});

test('result review is owner-scoped and resolves question text for stored attempts', async () => {
  const submitResult = await ExamUserService.submitExamResult({
    user_id: 'user-1',
    answers: { [uuid('1')]: uuid('b') },
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  state.insertedHistory = null;
  state.tableCalls = [];

  const ownResult = await ExamUserService.getExamResult('user-1', submitResult.id);
  assert.ok(ownResult);
  assert.equal(ownResult.details_json.questions.length, 1);
  assert.equal(ownResult.details_json.questions[0].body.text_bn, 'প্রশ্ন এক');
  assert.equal(ownResult.details_json.details[0].selected_option_text, 'খ');

  const foreignResult = await ExamUserService.getExamResult('user-2', submitResult.id);
  assert.equal(foreignResult, null);
});

test('answer disclosure stays hidden before a scheduled result publish time', async () => {
  state.examPapers = [
    {
      id: 'exam-2',
      default_negative_marks: 0.25,
      total_marks: 1,
      result_publish_time: '2099-01-01T00:00:00.000Z',
    },
  ];

  const result = await ExamUserService.submitExamResult({
    exam_id: 'exam-2',
    user_id: 'user-1',
    answers: { [uuid('1')]: uuid('b') },
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(result.details_json.questions[0].options.some((option: Row) => 'isCorrect' in option), false);
  assert.equal(result.details_json.questions[0].explanation, null);
  assert.equal('correct_option_text' in result.details_json.details[0], false);
});
