import { supabase } from '../../config/supabase';

// ==========================================
// 1. Staff & RBAC Management
// ==========================================
export const fetchStaffList = async () => {
  // Fetch roles
  const { data: rolesData, error: rolesErr } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (rolesErr) throw new Error(`Failed to fetch staff roles: ${rolesErr.message}`);
  if (!rolesData || rolesData.length === 0) return [];

  // Fetch corresponding profiles manually since no direct foreign key exists in schema
  const userIds = rolesData.map((r: any) => r.user_id).filter((id: string) => id);
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  return rolesData.map((role: any) => {
    const profile = profilesData?.find((p: any) => p.id === role.user_id);
    return {
      id: role.id,
      user_id: role.user_id,
      name: profile?.full_name || 'Unknown',
      email: profile?.email || 'N/A',
      role: role.role,
      assigned_at: role.created_at,
      is_active: role.is_active
    };
  });
};

export const assignRoleToUser = async (email: string, role: string) => {
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (userError || !user) throw new Error('User not found with this email');

  // Check if role already exists
  const { data: existing } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('user_roles')
      .update({ role, is_active: true })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  } else {
    const { data, error } = await supabase
      .from('user_roles')
      .insert({ user_id: user.id, role, is_active: true })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
};

export const revokeStaffAccess = async (id: string) => {
  const { error } = await supabase.from('user_roles').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const fetchPermissions = async () => {
  const { data, error } = await supabase
    .from('permissions')
    .select(`
      id,
      action,
      description,
      role_permissions ( role )
    `);
    
  if (error) throw new Error(`Failed to fetch permissions: ${error.message}`);
  
  return data.map((p: any) => ({
    id: p.id,
    action: p.action,
    description: p.description,
    roles: p.role_permissions?.map((rp: any) => rp.role) || []
  }));
};

export const toggleRolePermission = async (permId: number, role: string) => {
  const { data: existing } = await supabase
    .from('role_permissions')
    .select('*')
    .match({ permission_id: permId, role: role })
    .single();

  if (existing) {
    const { error } = await supabase.from('role_permissions').delete().match({ permission_id: permId, role: role });
    if (error) throw new Error(error.message);
    return { status: 'removed' };
  } else {
    const { error } = await supabase.from('role_permissions').insert({ permission_id: permId, role: role });
    if (error) throw new Error(error.message);
    return { status: 'added' };
  }
};

// ==========================================
// 2. Active Sessions & Security Audit
// ==========================================
export const fetchActiveSessions = async () => {
  // Removed is_active filter since it doesn't exist in DB schema
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('*')
    .order('last_active', { ascending: false });
    
  if (error) throw new Error(error.message);
  return data;
};

export const revokeAdminSession = async (id: string) => {
  // Since there is no is_active column, we directly delete the session
  const { error } = await supabase
    .from('admin_sessions')
    .delete()
    .eq('id', id);
    
  if (error) throw new Error(error.message);
};

export const fetchSecurityLogs = async () => {
  const { data, error } = await supabase
    .from('admin_login_history')
    .select(`
      *,
      profiles!admin_login_history_admin_id_fkey(full_name)
    `)
    .order('login_at', { ascending: false })
    .limit(100);
    
  if (error) throw new Error(error.message);
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
  const { data, error } = await supabase
    .from('feature_flags')
    .update({ is_enabled, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select()
    .single();
    
  if (error) throw new Error(error.message);
  return data;
};

// ==========================================
// 4. Async Reports
// ==========================================
export const fetchReports = async () => {
  const { data, error } = await supabase
    .from('report_exports')
    .select('*')
    .order('generated_at', { ascending: false });
    
  if (error) throw new Error(error.message);
  return data;
};

export const createNewReportRequest = async (report_type: string, filters: any, requestedBy: string) => {
  const { data, error } = await supabase
    .from('report_exports')
    .insert([{ 
      report_type, 
      filters, 
      requested_by: requestedBy,
      status: 'pending' 
    }])
    .select()
    .single();
    
  if (error) throw new Error(error.message);
  return data;
};
