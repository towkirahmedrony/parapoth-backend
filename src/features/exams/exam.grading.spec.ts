import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findOptionById,
  isAnswerCorrect,
  isAnswerDisclosureAllowed,
  normalizeOptionId,
  optionDisplayText,
} from './exam.grading';

const uuidOptions = [
  { id: '0f7d1c2e-1111-4a4a-9c9c-000000000001', text_bn: 'ক', isCorrect: false },
  { id: '0f7d1c2e-2222-4a4a-9c9c-000000000002', text_bn: 'খ', isCorrect: true },
  { id: '0f7d1c2e-3333-4a4a-9c9c-000000000003', text_bn: 'গ', isCorrect: false },
  { id: '0f7d1c2e-4444-4a4a-9c9c-000000000004', text_bn: 'ঘ', isCorrect: false },
];

test('UUID option ids are graded by identity, not by numeric coercion', () => {
  const correctId = '0f7d1c2e-2222-4a4a-9c9c-000000000002';

  assert.equal(isAnswerCorrect(uuidOptions, correctId), true);
  assert.equal(isAnswerCorrect(uuidOptions, '0f7d1c2e-1111-4a4a-9c9c-000000000001'), false);
});

test('numeric option ids match string answers from the client', () => {
  const options = [
    { id: 1, text_bn: 'ক', isCorrect: false },
    { id: 2, text_bn: 'খ', isCorrect: true },
  ];

  assert.equal(isAnswerCorrect(options, '2'), true);
  assert.equal(isAnswerCorrect(options, 2), true);
  assert.equal(isAnswerCorrect(options, '1'), false);
});

test('snake_case correctness flag is supported', () => {
  const options = [
    { id: 'a', text_bn: 'ক', is_correct: false },
    { id: 'b', text_bn: 'খ', is_correct: true },
  ];

  assert.equal(isAnswerCorrect(options, 'b'), true);
  assert.equal(isAnswerCorrect(options, 'a'), false);
});

test('selected option lookup tolerates whitespace and ignores unknown ids', () => {
  assert.equal(normalizeOptionId('  b  '), 'b');
  assert.equal(findOptionById(uuidOptions, '  b  '), null);
  assert.equal(isAnswerCorrect(uuidOptions, '  '), false);
  assert.equal(isAnswerCorrect(uuidOptions, null), false);
});

test('option display text prefers Bangla then English', () => {
  assert.equal(optionDisplayText({ id: 'a', text_bn: 'ক', text_en: 'A' }), 'ক');
  assert.equal(optionDisplayText({ id: 'b', text_en: 'B' }), 'B');
  assert.equal(optionDisplayText({ id: 'c' }), null);
  assert.equal(optionDisplayText(null), null);
});

test('correct answers are disclosed only after a real exam publishes results', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');

  // Missing exam context always fails closed, even for practice attempts.
  assert.equal(isAnswerDisclosureAllowed(null, null, now), false);
  assert.equal(isAnswerDisclosureAllowed(null, '2027-01-01T00:00:00.000Z', now), false);
  assert.equal(isAnswerDisclosureAllowed('   ', '2027-01-01T00:00:00.000Z', now), false);

  // A real exam without a valid publish time also fails closed.
  assert.equal(isAnswerDisclosureAllowed('exam-1', null, now), false);
  assert.equal(isAnswerDisclosureAllowed('exam-1', '', now), false);
  assert.equal(isAnswerDisclosureAllowed('exam-1', 'not-a-date', now), false);

  assert.equal(isAnswerDisclosureAllowed('exam-1', '2027-01-01T00:00:00.000Z', now), false);
  assert.equal(isAnswerDisclosureAllowed('exam-1', '2026-10-18T11:59:00.000Z', now), true);
});
