import { supabase } from '../../config/supabase';

// ==========================================
// Home Grids (Dynamic Homepage Builder)
// ==========================================
export const getActiveHomeGrids = async () => {
  const { data, error } = await supabase
    .from('home_grids')
    .select('*')
    .eq('is_active', true)
    .order('serial_order', { ascending: true });
    
  if (error) throw error;
  return data;
};

export const upsertHomeGrid = async (gridPayload: any) => {
  const { data, error } = await supabase.from('home_grids').upsert(gridPayload).select().single();
  if (error) throw error;
  return data;
};

export const deleteHomeGrid = async (id: string) => {
  const { error } = await supabase.from('home_grids').delete().eq('id', id);
  if (error) throw error;
  return true;
};

export const reorderHomeGrids = async (reorderPayload: { id: string, serial_order: number }[]) => {
  for (const item of reorderPayload) {
    const { error } = await supabase.from('home_grids').update({ serial_order: item.serial_order }).eq('id', item.id);
    if(error) throw error;
  }
  return true;
};

// ==========================================
// Global Configs & Remote Controls
// ==========================================
export const getGlobalConfigs = async () => {
  const { data, error } = await supabase.from('app_configs').select('*').in('key', ['global_settings', 'global_notice', 'theme_config']);
  if (error) throw error;
  return data;
};

export const upsertAppConfig = async (key: string, valuePayload: any) => {
  const { data, error } = await supabase.from('app_configs').upsert({ key, ...valuePayload }, { onConflict: 'key' }).select().single();
  if (error) throw error;
  return data;
};

export const getGlobalThemeConfig = async () => {
  const { data, error } = await supabase
    .from('app_configs')
    .select('value')
    .eq('key', 'ui_theme_settings')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.value || null;
};

// ==========================================
// Emergency Flags (Kill Switches)
// ==========================================
export const getEmergencyFlags = async () => {
  const { data, error } = await supabase.from('emergency_flags').select('*').order('key', { ascending: true });
  if (error) throw error;
  return data;
};

export const createEmergencyFlag = async (flagPayload: any) => {
  const { data, error } = await supabase.from('emergency_flags').insert(flagPayload).select().single();
  if (error) throw error;
  return data;
};

export const toggleEmergencyFlag = async (key: string, is_active: boolean) => {
  const { data, error } = await supabase
    .from('emergency_flags')
    .update({ is_active, activated_at: is_active ? new Date().toISOString() : null })
    .eq('key', key)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ==========================================
// Support Desk (User Reports)
// ==========================================
export const getSupportTickets = async () => {
  const { data, error } = await supabase.from('user_reports').select(`*, profiles!fk_reporter_user(full_name)`).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const updateSupportTicket = async (id: string, updates: any) => {
  const { data, error } = await supabase.from('user_reports').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// ==========================================
// Audit Logs
// ==========================================
export const getAuditLogs = async () => {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
};

export const createAuditLog = async (adminId: string, action: string, targetTable: string, targetId: string, details: any) => {
  const { error } = await supabase.from('audit_logs').insert({ user_id: adminId, action, target_table: targetTable, target_id: targetId, details });
  if (error) console.error('Failed to create audit log:', error);
};

// ==========================================
// Admin Action Center (Alerts)
// ==========================================
export const getAdminAlerts = async () => {
  const { data, error } = await supabase.from('admin_alerts').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const resolveAdminAlert = async (id: string, adminId: string) => {
  const { data, error } = await supabase.from('admin_alerts').update({ is_read: true, status: 'resolved', resolved_by: adminId, resolved_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// ==========================================
// Global Notice (Merged from Admin System)
// ==========================================
export const updateGlobalNotice = async (noticeData: any) => {
  // প্রথমে আপডেট করার চেষ্টা করবে
  const { data, error } = await supabase
    .from('app_configs')
    .update({ value: noticeData })
    .eq('key', 'global_notice')
    .select()
    .single();

  if (error) {
    // যদি আগে থেকে না থাকে, তাহলে ইনসার্ট করবে
    const insertRes = await supabase
      .from('app_configs')
      .insert({ key: 'global_notice', value: noticeData })
      .select()
      .single();
      
    if (insertRes.error) throw new Error(insertRes.error.message);
    return insertRes.data;
  }
  
  return data;
};
