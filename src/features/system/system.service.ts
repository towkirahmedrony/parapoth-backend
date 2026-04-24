import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';

export const getEmergencyFlags = async () => {
  const { data, error } = await supabase.from('emergency_flags').select('*').order('key', { ascending: true });
  if (error) throw error;
  return data;
};

export const createEmergencyFlag = async (flagPayload: any) => {
  const { data, error } = await supabaseAdmin.from('emergency_flags').insert(flagPayload).select().single();
  if (error) throw error;
  return data;
};

export const toggleEmergencyFlag = async (key: string, is_active: boolean) => {
  const { data, error } = await supabaseAdmin
    .from('emergency_flags')
    .update({ is_active, activated_at: is_active ? new Date().toISOString() : null })
    .eq('key', key)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getSupportTickets = async () => {
  const { data, error } = await supabase.from('user_reports').select(`*, profiles!fk_reporter_user(full_name)`).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const updateSupportTicket = async (id: string, updates: any) => {
  const { data, error } = await supabaseAdmin.from('user_reports').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const getAuditLogs = async () => {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
};

export const createAuditLog = async (adminId: string, action: string, targetTable: string, targetId: string, details: any) => {
  const { error } = await supabaseAdmin.from('audit_logs').insert({ user_id: adminId, action, target_table: targetTable, target_id: targetId, details });
  if (error) console.error('Failed to create audit log:', error);
};

export const getAdminAlerts = async () => {
  const { data, error } = await supabase.from('admin_alerts').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const resolveAdminAlert = async (id: string, adminId: string) => {
  const { data, error } = await supabaseAdmin.from('admin_alerts').update({ is_read: true, status: 'resolved', resolved_by: adminId, resolved_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};
