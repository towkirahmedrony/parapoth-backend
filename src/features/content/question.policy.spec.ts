import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditQuestion } from './question.policy';

test('Editor and Teacher may update only questions they own', () => {
  assert.equal(canEditQuestion('editor', 'user-1', 'user-1'), true);
  assert.equal(canEditQuestion('teacher', 'user-1', 'user-1'), true);
  assert.equal(canEditQuestion('editor', 'user-1', 'user-2'), false);
  assert.equal(canEditQuestion('teacher', 'user-1', null), false);
});

test('Students cannot update questions and missing identity fails closed', () => {
  assert.equal(canEditQuestion('student', 'user-1', 'user-1'), false);
  assert.equal(canEditQuestion('student', 'user-1', 'user-2'), false);
  assert.equal(canEditQuestion('teacher', null, 'user-1'), false);
});

test('Only privileged content reviewer roles bypass question ownership', () => {
  assert.equal(canEditQuestion('admin', 'admin-1', 'author-1'), true);
  assert.equal(canEditQuestion('moderator', 'mod-1', 'author-1'), true);
  assert.equal(canEditQuestion('super_admin', 'root-1', 'author-1'), true);
});
