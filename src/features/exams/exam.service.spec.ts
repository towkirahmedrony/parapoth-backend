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
  examPaperQuestions: Row[];
  history: Row[];
  insertedHistory: Row | null;
  insertedDetails: Row[];
  insertedRows: Record<string, Row[]>;
  tableCalls: string[];
  rpcQuestions: Row[];
};

const state: FakeState = {
  questions: [],
  examPapers: [],
  examPaperQuestions: [],
  history: [],
  insertedHistory: null,
  insertedDetails: [],
  insertedRows: {},
  tableCalls: [],
  rpcQuestions: [],
};

const recordInsert = (table: string, rows: Row[]) => {
  state.insertedRows[table] = state.insertedRows[table] || [];
  state.insertedRows[table].push(...rows);
};

const createBuilder = (table: string) => {
  const filters: Record<string, any> = {};
  let inserted: Row[] | null = null;

  const resolveQuery = (mode: 'many' | 'single') => {
    state.tableCalls.push(`${table}:${mode}`);

    if (table === 'exam_papers') {
      const paper = state.examPapers.find((item) => String(item.id) === String(filters.id));
      return { data: mode === 'single' ? paper ?? null : paper ? [paper] : [], error: null };
    }

    if (table === 'exam_paper_questions') {
      const rows = state.examPaperQuestions.filter(
        (item) => String(item.exam_id) === String(filters.exam_id)
      );
      return { data: rows, error: null };
    }

    if (table === 'questions') {
      const ids: string[] = Array.isArray(filters.id) ? filters.id.map(String) : [];
      const rows =
        ids.length > 0
          ? state.questions.filter((item) => ids.includes(String(item.id)))
          : state.questions;
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
      recordInsert(table, rows);
      return builder;
    },
    maybeSingle: async () => resolveQuery('single'),
    single: async () => resolveQuery('single'),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolveQuery('many')).then(onFulfilled, onRejected),
  };

  return builder;
};

const fakeSupabase = {
  from: (table: string) => createBuilder(table),
  rpc: async (_name: string, _args: Row) => ({ data: state.rpcQuestions, error: null }),
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
  {
    id: uuid('3'),
    type: 'MCQ',
    difficulty_level: 'easy',
    body: { text_bn: 'প্রশ্ন তিন', text_en: 'Question three', image_url: null },
    options: [
      { id: uuid('e'), text_bn: 'ঙ', text_en: 'E', isCorrect: true },
      { id: uuid('f'), text_bn: 'চ', text_en: 'F', isCorrect: false },
    ],
    explanation: 'গোপন ব্যাখ্যা',
  },
];

const hasCorrectFlag = (options: Row[]) =>
  options.some((option) => 'isCorrect' in option || 'is_correct' in option);

beforeEach(() => {
  state.questions = questions.map((question) => ({ ...question }));
  state.examPapers = [
    {
      id: 'exam-1',
      default_negative_marks: 0.25,
      total_marks: 2,
      result_publish_time: '2020-01-01T00:00:00.000Z',
      is_published: true,
    },
    {
      id: 'exam-2',
      default_negative_marks: 0.25,
      total_marks: 1,
      result_publish_time: '2099-01-01T00:00:00.000Z',
      is_published: true,
    },
    {
      id: 'exam-3',
      default_negative_marks: 0.25,
      total_marks: 1,
      result_publish_time: null,
      is_published: true,
    },
    {
      id: 'exam-unpublished',
      default_negative_marks: 0.25,
      total_marks: 1,
      result_publish_time: '2020-01-01T00:00:00.000Z',
      is_published: false,
    },
    {
      id: 'exam-empty',
      default_negative_marks: 0.25,
      total_marks: 1,
      result_publish_time: '2020-01-01T00:00:00.000Z',
      is_published: true,
    },
  ];
  state.examPaperQuestions = [
    { id: 'eq-1', exam_id: 'exam-1', question_id: uuid('1'), sequence: 1 },
    { id: 'eq-2', exam_id: 'exam-1', question_id: uuid('2'), sequence: 2 },
    { id: 'eq-3', exam_id: 'exam-2', question_id: uuid('1'), sequence: 1 },
    { id: 'eq-4', exam_id: 'exam-3', question_id: uuid('1'), sequence: 1 },
    { id: 'eq-5', exam_id: 'exam-unpublished', question_id: uuid('1'), sequence: 1 },
  ];
  state.history = [];
  state.insertedHistory = null;
  state.insertedDetails = [];
  state.insertedRows = {};
  state.tableCalls = [];
  state.rpcQuestions = questions.map((question) => ({ ...question }));
});

test('arena question retrieval never exposes correct flags or explanations', async () => {
  const arena = await ExamUserService.getArenaQuestions('user-1', 10);

  assert.equal(arena.length, 3);
  arena.forEach((question: Row) => {
    assert.equal('explanation' in question, false);
    assert.equal(hasCorrectFlag(question.options), false);
  });
});

test('generateExam sanitizes correct flags and explanations', async () => {
  const generated = await ExamUserService.generateExam('user-1', {
    topics: ['topic-1'],
    limit: 10,
  });

  generated.forEach((question: Row) => {
    assert.equal('explanation' in question, false);
    assert.equal(hasCorrectFlag(question.options), false);
  });
});

test('submit stores a reviewable snapshot and grades UUID options correctly', async () => {
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
    exam_id: 'exam-1',
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
  assert.equal(ownResult.details_json.details[0].correct_option_text, 'খ');

  const foreignResult = await ExamUserService.getExamResult('user-2', submitResult.id);
  assert.equal(foreignResult, null);
});

test('answer disclosure stays hidden before a scheduled result publish time', async () => {
  const result = await ExamUserService.submitExamResult({
    exam_id: 'exam-2',
    user_id: 'user-1',
    answers: { [uuid('1')]: uuid('b') },
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(hasCorrectFlag(result.details_json.questions[0].options), false);
  assert.equal(result.details_json.questions[0].explanation, null);
  assert.equal('correct_option_text' in result.details_json.details[0], false);
});

test('a missing publish time fails closed', async () => {
  const result = await ExamUserService.submitExamResult({
    exam_id: 'exam-3',
    user_id: 'user-1',
    answers: { [uuid('1')]: uuid('b') },
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(hasCorrectFlag(result.details_json.questions[0].options), false);
});

test('omitting exam_id never enables answer disclosure', async () => {
  const result = await ExamUserService.submitExamResult({
    user_id: 'user-1',
    answers: { [uuid('1')]: uuid('b') },
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.exam_id, null);
  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(hasCorrectFlag(result.details_json.questions[0].options), false);
  assert.equal(result.details_json.questions[0].explanation, null);
  assert.equal('correct_option_id' in result.details_json.details[0], false);
});

test('submitting question ids without answers does not reveal answer keys', async () => {
  const result = await ExamUserService.submitExamResult({
    exam_id: 'exam-1',
    user_id: 'user-1',
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.correct_count, 0);
  assert.equal(result.wrong_count, 0);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.details_json.details[0].status, 'skipped');
  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(hasCorrectFlag(result.details_json.questions[0].options), false);
  assert.equal(result.details_json.questions[0].explanation, null);
  assert.equal('correct_option_id' in result.details_json.details[0], false);
  assert.equal('correct_option_text' in result.details_json.details[0], false);
});

test('omitting exam_id with question ids but no answers reveals nothing protected', async () => {
  const result = await ExamUserService.submitExamResult({
    user_id: 'user-1',
    question_ids: [uuid('1')],
    time_taken: 10,
  });

  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(hasCorrectFlag(result.details_json.questions[0].options), false);
  assert.equal(result.details_json.questions[0].explanation, null);
  assert.equal('correct_option_id' in result.details_json.details[0], false);
});

test('an unknown exam id is rejected and no result is written', async () => {
  await assert.rejects(
    ExamUserService.submitExamResult({
      exam_id: 'exam-does-not-exist',
      user_id: 'user-1',
      question_ids: [uuid('1')],
      time_taken: 10,
    }),
    /Exam not found/
  );

  assert.equal(state.insertedRows.exam_history, undefined);
});

test('an unpublished exam is rejected and no result is written', async () => {
  await assert.rejects(
    ExamUserService.submitExamResult({
      exam_id: 'exam-unpublished',
      user_id: 'user-1',
      question_ids: [uuid('1')],
      time_taken: 10,
    }),
    /Exam is not available/
  );

  assert.equal(state.insertedRows.exam_history, undefined);
});

test('questions from another exam are rejected before any write', async () => {
  await assert.rejects(
    ExamUserService.submitExamResult({
      exam_id: 'exam-1',
      user_id: 'user-1',
      answers: { [uuid('3')]: uuid('e') },
      question_ids: [uuid('3')],
      time_taken: 10,
    }),
    /does not belong to this exam/
  );

  assert.equal(state.insertedRows.exam_history, undefined);
});

test('an exam without an authoritative question set fails closed', async () => {
  await assert.rejects(
    ExamUserService.submitExamResult({
      exam_id: 'exam-empty',
      user_id: 'user-1',
      question_ids: [uuid('1')],
      time_taken: 10,
    }),
    /question set is not configured/
  );

  assert.equal(state.insertedRows.exam_history, undefined);
});

test('legacy stored snapshots cannot leak answer keys before results publish', async () => {
  state.history = [
    {
      id: 'legacy-1',
      user_id: 'user-1',
      exam_id: 'exam-2',
      score: 0,
      total_marks: 1,
      correct_count: 0,
      wrong_count: 1,
      skipped_count: 0,
      time_taken: 10,
      created_at: '2026-10-18T12:00:00.000Z',
      details_json: {
        answers: { [uuid('1')]: uuid('a') },
        details: [
          {
            question_id: uuid('1'),
            selected_option: uuid('a'),
            selected_option_text: 'ক',
            is_correct: false,
            marks_awarded: -0.25,
            status: 'wrong',
            correct_option_id: uuid('b'),
            correct_option_text: 'খ',
            debug: { answer: uuid('b') },
          },
        ],
        questions: [
          {
            id: uuid('1'),
            body: { text_bn: 'প্রশ্ন এক', text_en: 'Question one', image_url: null },
            options: [
              { id: uuid('a'), text_bn: 'ক', isCorrect: false },
              { id: uuid('b'), text_bn: 'খ', isCorrect: true },
            ],
            explanation: 'ব্যাখ্যা এক',
            answer_key: uuid('b'),
          },
        ],
        correct_answers_revealed: true,
      },
    },
  ];

  const result = await ExamUserService.getExamResult('user-1', 'legacy-1');
  assert.ok(result);
  assert.equal(result.details_json.correct_answers_revealed, false);
  assert.equal(hasCorrectFlag(result.details_json.questions[0].options), false);
  assert.equal(result.details_json.questions[0].explanation, null);
  assert.equal('answer_key' in result.details_json.questions[0], false);
  assert.equal('correct_option_id' in result.details_json.details[0], false);
  assert.equal('correct_option_text' in result.details_json.details[0], false);
  assert.equal('debug' in result.details_json.details[0], false);
});

test('review uses the exam question order and resolves option text', async () => {
  const submitResult = await ExamUserService.submitExamResult({
    exam_id: 'exam-1',
    user_id: 'user-1',
    answers: {
      [uuid('2')]: uuid('c'),
      [uuid('1')]: uuid('b'),
    },
    question_ids: [uuid('2'), uuid('1')],
    time_taken: 15,
  });

  assert.deepEqual(
    submitResult.details_json.questions.map((question: Row) => question.id),
    [uuid('1'), uuid('2')]
  );
});
