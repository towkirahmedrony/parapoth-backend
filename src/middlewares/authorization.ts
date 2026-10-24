export const CANONICAL_ROLES = [
  'super_admin', 'admin', 'moderator', 'editor', 'teacher', 'student',
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

export const PERMISSIONS = {
  USER_READ: 'users.read',
  USER_MANAGE: 'users.manage',
  ROLE_ASSIGN_STAFF: 'roles.assign.staff',
  ROLE_ASSIGN_ADMIN: 'roles.assign.admin',
  ROLE_ASSIGN_SUPER_ADMIN: 'roles.assign.super_admin',
  EXAMS_MANAGE: 'exams.manage',
  QUESTIONS_MANAGE: 'questions.manage',
  QUESTIONS_REVIEW: 'questions.review',
  MODERATION_REVIEW: 'moderation.review',
  MODERATION_ACTION: 'moderation.action',
  ANALYTICS_READ: 'analytics.read',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_LOGS_READ: 'audit_logs.read',
  QUOTAS_MANAGE: 'quotas.manage',
  ENTERPRISE_MANAGE: 'enterprise.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const isCanonicalRole = (role: string): role is CanonicalRole =>
  (CANONICAL_ROLES as readonly string[]).includes(role);

export const roleCanAccessRoute = (role: CanonicalRole, allowedRoles: readonly string[]): boolean =>
  role === 'super_admin' || allowedRoles.includes(role);

export const canAssignRole = (
  actorRole: string,
  targetRole: string,
  isSelf: boolean,
): boolean => {
  if (isSelf || !isCanonicalRole(actorRole) || !isCanonicalRole(targetRole)) return false;
  if (actorRole === 'super_admin') return true;
  return actorRole === 'admin' && ['student', 'moderator', 'editor', 'teacher'].includes(targetRole);
};
