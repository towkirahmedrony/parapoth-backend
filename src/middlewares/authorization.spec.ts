import assert from 'node:assert/strict';
import test from 'node:test';
import { canAssignRole, isCanonicalRole, PERMISSIONS, roleCanAccessRoute } from './authorization';

test('canonical role set contains exactly the six supported role identifiers', () => {
  const expected = ['super_admin', 'admin', 'moderator', 'editor', 'teacher', 'student'];
  for (const role of expected) assert.equal(isCanonicalRole(role), true);
  assert.equal(isCanonicalRole('finance'), false);
  assert.equal(isCanonicalRole('owner'), false);
  assert.equal(isCanonicalRole('Super_Admin'), false);
});

test('permission identifiers are stable and unique', () => {
  const identifiers = Object.values(PERMISSIONS);
  assert.equal(new Set(identifiers).size, identifiers.length);
  assert.ok(identifiers.includes('roles.assign.staff'));
  assert.ok(identifiers.includes('roles.assign.super_admin'));
  assert.ok(identifiers.includes('moderation.action'));
  assert.ok(identifiers.includes('audit_logs.read'));
});

test('Super Admin is the only universal route override', () => {
  assert.equal(roleCanAccessRoute('super_admin', ['student']), true);
  assert.equal(roleCanAccessRoute('admin', ['student']), false);
  assert.equal(roleCanAccessRoute('moderator', ['moderator']), true);
  assert.equal(roleCanAccessRoute('teacher', ['editor']), false);
});

test('Admin may assign staff roles but not Admin or Super Admin; self-assignment is denied', () => {
  for (const role of ['student', 'moderator', 'editor', 'teacher']) {
    assert.equal(canAssignRole('admin', role, false), true);
  }
  assert.equal(canAssignRole('admin', 'admin', false), false);
  assert.equal(canAssignRole('admin', 'super_admin', false), false);
  assert.equal(canAssignRole('admin', 'moderator', true), false);
  assert.equal(canAssignRole('student', 'teacher', false), false);
  assert.equal(canAssignRole('teacher', 'admin', false), false);
  assert.equal(canAssignRole('super_admin', 'super_admin', false), true);
});
