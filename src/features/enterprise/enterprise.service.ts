import { supabase } from '../../config/supabase';

export const fetchStaffList = async () => {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, name, email, role, assigned_at')
    .order('assigned_at', { ascending: false });
  
  if (error) throw new Error(error.message);
  return data;
};

export const assignRoleToUser = async (email: string, role: string) => {
  // First find user by email, then update/insert into admin_users table
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', email)
    .single();

  if (userError || !user) throw new Error('User not found');

  const { data, error } = await supabase
    .from('admin_users')
    .upsert({ user_id: user.id, email, name: user.name, role, assigned_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const revokeStaffAccess = async (id: string) => {
  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const fetchPermissions = async () => {
  const { data, error } = await supabase.from('rbac_permissions').select('*');
  if (error) throw new Error(error.message);
  return data;
};

export const toggleRolePermission = async (permId: number, role: string) => {
  // Fetch current roles for the permission
  const { data: perm, error: fetchError } = await supabase
    .from('rbac_permissions')
    .select('roles')
    .eq('id', permId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  let updatedRoles = [...(perm.roles || [])];
  if (updatedRoles.includes(role)) {
    updatedRoles = updatedRoles.filter(r => r !== role);
  } else {
    updatedRoles.push(role);
  }

  const { data, error } = await supabase
    .from('rbac_permissions')
    .update({ roles: updatedRoles })
    .eq('id', permId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const fetchActiveSessions = async () => {
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('*')
    .eq('is_active', true)
    .order('last_active', { ascending: false });
    
  if (error) throw new Error(error.message);
  return data;
};

export const revokeAdminSession = async (id: string) => {
  const { error } = await supabase
    .from('admin_sessions')
    .update({ is_active: false })
    .eq('id', id);
    
  if (error) throw new Error(error.message);
};

export const fetchSecurityLogs = async () => {
  const { data, error } = await supabase
    .from('admin_login_logs')
    .select('*')
    .order('login_at', { ascending: false })
    .limit(100);
    
  if (error) throw new Error(error.message);
  return data;
};

export const fetchFeatureFlags = async () => {
  const { data, error } = await supabase.from('feature_flags').select('*');
  if (error) throw new Error(error.message);
  return data;
};

export const updateFeatureFlag = async (key: string, is_enabled: boolean) => {
  const { data, error } = await supabase
    .from('feature_flags')
    .update({ is_enabled, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select()
    .single();
    
  if (error) throw new Error(error.message);
  return data;
};

export const fetchReports = async () => {
  const { data, error } = await supabase
    .from('async_reports')
    .select('*')
    .order('requested_at', { ascending: false });
    
  if (error) throw new Error(error.message);
  return data;
};

export const createNewReportRequest = async (report_type: string, filters: any, requestedBy: string) => {
  const { data, error } = await supabase
    .from('async_reports')
    .insert([{ 
      report_type, 
      filters, 
      requested_by: requestedBy,
      status: 'processing',
      requested_at: new Date().toISOString()
    }])
    .select()
    .single();
    
  if (error) throw new Error(error.message);
  
  // Note: In a real scenario, this would trigger a background job/worker
  // using something like BullMQ or a Supabase Edge Function to generate the file.
  
  return data;
};
