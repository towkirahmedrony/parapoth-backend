import { supabase } from '../../config/supabase';
import { createUserSupabaseClient } from '../../config/userSupabase';

// ==========================================
// 1. Staff & RBAC Management
// ==========================================
export const fetchStaffList = async () => {
  const { data: rolesData, error: rolesErr } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: false });
  if (rolesErr) throw new Error('Failed to fetch staff roles');
  if (!rolesData?.length) return [];

  const userIds = rolesData.map((r: any) => r.user_id).filter(Boolean);
  const { data: profilesData } = await supabase
    .from('profiles').select('id, full_name, email').in('id', userIds);

  return rolesData.map((role: any) => {
    const profile = profilesData?.find((p: any) => p.id === role.user_id);
    return {
      id: role.id, user_id: role.user_id,
      name: profile?.full_name || 'Unknown', email: profile?.email || 'N/A',
      role: role.role, assigned_at: role.created_at, is_active: role.is_active,
    };
  });
};

export const assignRoleToUser = async (email: string, role: string, accessToken: string) => {
  if (typeof email !== 'string' || !email.trim() || typeof role !== 'string') {
    throw new Error('Invalid role assignment');
  }
  const { data: user, error: userError } = await supabase
    .from('profiles').select('id').eq('email', email.trim()).maybeSingle();
  if (userError || !user) throw new Error('User not found');

  const { data, error } = await createUserSupabaseClient(accessToken).rpc('assign_user_role', {
    p_target_user_id: user.id,
    p_role: role,
    p_is_active: true,
  });
  if (error) {
    if (error.code === '42501') throw new Error('Role assignment not authorized');
    if (error.code === '22023') throw new Error('Invalid role assignment');
    if (error.code === '23514') throw new Error('Role assignment conflicts with a security safeguard');
    throw new Error('Role assignment failed');
  }
  return data;
};

export const revokeStaffAccess = async (id: string, accessToken: string) => {
  const { data: assignment, error: lookupError } = await supabase
    .from('user_roles').select('user_id,role').eq('id', id).maybeSingle();
  if (lookupError || !assignment) throw new Error('Role assignment not found');
  const { error } = await createUserSupabaseClient(accessToken).rpc('assign_user_role', {
    p_target_user_id: assignment.user_id,
    p_role: assignment.role,
    p_is_active: false,
  });
  if (error) {
    if (error.code === '42501') throw new Error('Role revocation not authorized');
    if (error.code === '23514') throw new Error('Cannot remove the last active Super Admin');
    throw new Error('Role revocation failed');
  }
};

export const fetchPermissions = async () => {
  const { data, error } = await supabase
    .from('permissions')
    .select('id,action,description,role_permissions(role)');
  if (error) throw new Error('Failed to fetch permissions');
  return (data || []).map((p: any) => ({
    id: p.id, action: p.action, description: p.description,
    roles: p.role_permissions?.map((rp: any) => rp.role) || [],
  }));
};

export const toggleRolePermission = async (permId: number, role: string, accessToken: string) => {
  const { data: permission, error: lookupError } = await supabase
    .from('permissions').select('action').eq('id', permId).maybeSingle();
  if (lookupError || !permission?.action) throw new Error('Permission not found');
  const { data: existing, error: existingError } = await supabase
    .from('role_permissions').select('permission_id').match({ permission_id: permId, role }).maybeSingle();
  if (existingError) throw new Error('Permission mapping lookup failed');
  const enabled = !existing;
  const { error } = await createUserSupabaseClient(accessToken).rpc('set_role_permission', {
    p_role: role, p_action: permission.action, p_enabled: enabled,
  });
  if (error) {
    if (error.code === '42501') throw new Error('Permission mapping changes require Super Admin');
    throw new Error('Permission mapping update failed');
  }
  return { status: enabled ? 'added' : 'removed' };
};

// ==========================================
// 2. Active Sessions & Security Audit
// ==========================================
export const fetchActiveSessions = async (accessToken: string) => {
  const { data, error } = await createUserSupabaseClient(accessToken).from('admin_auth_sessions')
    .select('id,user_id,created_at,last_seen_at,revoked_at,revoked_by')
    .is('revoked_at', null).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('Failed to fetch sessions');
  return data;
};

export const revokeAdminSession = async (id: string, accessToken: string) => {
  const { error } = await createUserSupabaseClient(accessToken).rpc('revoke_admin_auth_session', {
    p_session_record_id: id,
  });
  if (error) {
    if (error.code === '42501') throw new Error('Session revocation not authorized');
    if (error.code === 'P0002') throw new Error('Session not found or already revoked');
    throw new Error('Failed to revoke application session');
  }
};

export const fetchSecurityLogs = async (accessToken: string) => {
  const { data, error } = await createUserSupabaseClient(accessToken).from('security_audit_logs')
    .select('id,actor_user_id,target_user_id,action,resource_type,resource_id,old_values,new_values,outcome,request_id,created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('Failed to fetch security audit logs');
  return data;
};

// ==========================================
// 3. Feature Flags
// ==========================================
export const fetchFeatureFlags = async () => {
  const { data, error } = await supabase.from('feature_flags').select('*');
  if (error) throw new Error(error.message);
  return data;
};

export const updateFeatureFlag = async (key: string, is_enabled: boolean) => {
  const { data, error } = await supabase.from('feature_flags')
    .update({ is_enabled, updated_at: new Date().toISOString() }).eq('key', key).select().single();
  if (error) throw new Error(error.message);
  return data;
};

// ==========================================
// 4. Async Reports
// ==========================================
export const fetchReports = async () => {
  const { data, error } = await supabase.from('report_exports').select('*').order('generated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
};

export const createNewReportRequest = async (report_type: string, filters: any, requestedBy: string) => {
  const { data, error } = await supabase.from('report_exports').insert([{
    report_type, filters, requested_by: requestedBy, status: 'pending',
  }]).select().single();
  if (error) throw new Error(error.message);
  return data;
};
