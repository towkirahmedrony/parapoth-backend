import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * Premium list responses: every locked node must be flagged with `is_locked`,
 * the decision must come from the authoritative access function, and the list
 * payload must never contain question/answer content.
 */

type Row = Record<string, any>;

const state: {
  subjects: Row[];
  chapters: Row[];
  topics: Row[];
  access: Row | null;
  accessError: Row | null;
} = {
  subjects: [],
  chapters: [],
  topics: [],
  access: null,
  accessError: null,
};

const createBuilder = (table: string) => {
  const filters: Row[] = [];
  let order = '';

  const rows = (): Row[] => {
    if (table === 'subjects') return state.subjects;
    if (table === 'chapters') return state.chapters;
    if (table === 'topics') return state.topics;
    return [];
  };

  const resolve = () => {
    const matched = rows().filter((row) =>
      filters.every(({ column, value }) => String(row[column]) === String(value))
    );
    const sorted = order
      ? matched.slice().sort((a, b) => Number(a[order] ?? 0) - Number(b[order] ?? 0))
      : matched;
    return { data: sorted, error: null };
  };

  const builder: any = {
    select: () => builder,
    eq: (column: string, value: any) => {
      filters.push({ column, value });
      return builder;
    },
    order: (column: string) => {
      order = column;
      return builder;
    },
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };

  return builder;
};

const fakeSupabase = {
  from: (table: string) => createBuilder(table),
  rpc: async (name: string) => {
    if (name === 'get_user_access') {
      if (state.accessError) return { data: null, error: state.accessError };
      return { data: state.access, error: null };
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

const { buildCurriculumTree } = require('./content.service');

const flatten = (nodes: Row[]): Row[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);

beforeEach(() => {
  state.subjects = [
    { id: 'sub-1', name_bn: 'পদার্থ', name_en: 'Physics', is_premium: false, sequence: 1 },
    { id: 'sub-2', name_bn: 'রসায়ন', name_en: 'Chemistry', is_premium: true, sequence: 2 },
  ];
  state.chapters = [
    { id: 'ch-1', subject_id: 'sub-1', name_bn: 'অধ্যায় ১', is_premium: false, sequence: 1 },
    { id: 'ch-2', subject_id: 'sub-2', name_bn: 'অধ্যায় ২', is_premium: true, sequence: 2 },
  ];
  state.topics = [
    { id: 'tp-1', chapter_id: 'ch-1', name_bn: 'টপিক ১', is_premium: false, sequence: 1 },
    { id: 'tp-2', chapter_id: 'ch-2', name_bn: 'টপিক ২', is_premium: true, sequence: 2 },
  ];
  state.access = {
    tier: 'free',
    premium: false,
    source: 'free',
    premium_expires_at: null,
    unlimited_all: false,
    unlimited_features: [],
  };
  state.accessError = null;
});

test('a free user receives is_locked on every premium node', async () => {
  const tree = await buildCurriculumTree('user-1');
  const nodes = flatten(tree);

  assert.equal(nodes.find((node) => node.id === 'sub-1')?.is_locked, false);
  assert.equal(nodes.find((node) => node.id === 'sub-2')?.is_locked, true);
  assert.equal(nodes.find((node) => node.id === 'ch-2')?.is_locked, true);
  assert.equal(nodes.find((node) => node.id === 'tp-1')?.is_locked, false);
  assert.equal(nodes.find((node) => node.id === 'tp-2')?.is_locked, true);
});

test('a premium user receives no locked nodes', async () => {
  state.access = { ...state.access, tier: 'premium', premium: true, source: 'grant_user' };

  const tree = await buildCurriculumTree('user-1');

  assert.equal(flatten(tree).some((node) => node.is_locked === true), false);
});

test('an unavailable access check fails closed', async () => {
  state.accessError = { message: 'rpc unavailable' };

  const tree = await buildCurriculumTree('user-1');

  assert.equal(flatten(tree).find((node) => node.id === 'sub-2')?.is_locked, true);
});

test('the curriculum payload never carries question or answer fields', async () => {
  const tree = await buildCurriculumTree('user-1');
  const payload = JSON.stringify(tree);

  for (const protectedField of ['correct_option_id', 'correct_option_text', 'explanation', 'options', 'answer']) {
    assert.equal(payload.includes(protectedField), false, `leaked ${protectedField}`);
  }
});
