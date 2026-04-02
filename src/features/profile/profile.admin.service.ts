import { supabase } from '../../config/supabase';
import { UpdateAdminProfileDTO } from './profile.admin.types';

export const getAdminIdentity = async (adminId: string) => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, phone_number, bio, gender, date_of_birth, address, language_preference, avatar_url, account_status, created_at, is_2fa_enabled')
    .eq('id', adminId)
    .single();

  if (profileError) throw profileError;

  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', adminId)
    .eq('is_active', true)
    .single();

  if (roleError && roleError.code !== 'PGRST116') throw roleError; // PGRST116 is not found

  return {
    ...profile,
    role: roleData?.role || 'admin',
  };
};

export const updateAdminIdentity = async (adminId: string, data: UpdateAdminProfileDTO) => {
  const { data: updatedProfile, error } = await supabase
    .from('profiles')
    .update(data)
    .eq('id', adminId)
    .select()
    .single();

  if (error) throw error;
  return updatedProfile;
};

export const getAdminPerformance = async (adminId: string, timeframe: string) => {
  // Simplification for timeframe logic; adjust based on actual requirements
  const { data, error } = await supabase
    .from('admin_performance_stats')
    .select('*')
    .eq('admin_id', adminId)
    .order('month', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data[0] || {};
};

export const getSecurityData = async (adminId: string) => {
  const [sessionsRes, loginsRes] = await Promise.all([
    supabase.from('admin_sessions').select('*').eq('admin_id', adminId),
    supabase.from('admin_login_history').select('*').eq('admin_id', adminId).order('login_at', { ascending: false }).limit(10)
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (loginsRes.error) throw loginsRes.error;

  return {
    activeSessions: sessionsRes.data,
    loginHistory: loginsRes.data,
  };
};

export const terminateSession = async (adminId: string, sessionId: string) => {
  const { error } = await supabase
    .from('admin_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('admin_id', adminId);

  if (error) throw error;
  return { success: true };
};

export const toggle2FA = async (adminId: string, isEnabled: boolean) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_2fa_enabled: isEnabled })
    .eq('id', adminId);

  if (error) throw error;
  return { is_2fa_enabled: isEnabled };
};

export const getAdminPermissions = async (adminId: string) => {
  // First get the role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', adminId)
    .eq('is_active', true)
    .single();

  if (!roleData?.role) return [];

  // Then get permissions for that role
  const { data: permissionsData, error } = await supabase
    .from('role_permissions')
    .select('permissions(action)')
    .eq('role', roleData.role);

  if (error) throw error;
  return permissionsData.map((p: any) => p.permissions.action);
};

export const getAdminAuditTrail = async (adminId: string) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', adminId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data;
};
