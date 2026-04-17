import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';

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
  const { data, error } = await supabaseAdmin.from('home_grids').upsert(gridPayload).select().single();
  if (error) throw error;
  return data;
};

export const deleteHomeGrid = async (id: string) => {
  const { error } = await supabaseAdmin.from('home_grids').delete().eq('id', id);
  if (error) throw error;
  return true;
};

export const reorderHomeGrids = async (reorderPayload: { id: string, serial_order: number }[]) => {
  for (const item of reorderPayload) {
    const { error } = await supabaseAdmin.from('home_grids').update({ serial_order: item.serial_order }).eq('id', item.id);
    if(error) throw error;
  }
  return true;
};

// ==========================================
// Global Configs & Remote Controls
// ==========================================
export const getGlobalConfigs = async () => {
  const { data, error } = await supabase.from('app_configs').select('*').in('key', ['global_settings', 'global_notice', 'theme_config', 'daily_quote', 'xp_rules']);
  if (error) throw error;
  return data;
};

export const getAppConfigByKey = async (key: string) => {
  const { data, error } = await supabase.from('app_configs').select('*').eq('key', key).maybeSingle();
  if (error) throw error;
  return data;
};

export const upsertAppConfig = async (key: string, valuePayload: any) => {
  const { data, error } = await supabaseAdmin.from('app_configs').upsert({ key, ...valuePayload }, { onConflict: 'key' }).select().single();
  if (error) throw error;
  return data;
};

export const getGlobalThemeConfig = async () => {
  const { data, error } = await supabase
    .from('app_configs')
    .select('value')
    .eq('key', 'theme_config')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.value || null;
};

// ==========================================
// XP Rules 
// ==========================================
export const updateXPRules = async (rules: any) => {
  const { data, error } = await supabaseAdmin
    .from('app_configs')
    .upsert({ key: 'xp_rules', value: rules }, { onConflict: 'key' })
    .select()
    .single();

  if (error) throw error;
  return data;
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

// ==========================================
// Support Desk (User Reports)
// ==========================================
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

// ==========================================
// Audit Logs
// ==========================================
export const getAuditLogs = async () => {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
};

export const createAuditLog = async (adminId: string, action: string, targetTable: string, targetId: string, details: any) => {
  const { error } = await supabaseAdmin.from('audit_logs').insert({ user_id: adminId, action, target_table: targetTable, target_id: targetId, details });
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
  const { data, error } = await supabaseAdmin.from('admin_alerts').update({ is_read: true, status: 'resolved', resolved_by: adminId, resolved_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// ==========================================
// Global Notice
// ==========================================
export const updateGlobalNotice = async (noticeData: any) => {
  const { data, error } = await supabaseAdmin
    .from('app_configs')
    .upsert({ key: 'global_notice', value: noticeData }, { onConflict: 'key' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ==========================================
// Leaderboard Levels Configuration
// ==========================================
export const getLevels = async () => {
  const { data, error } = await supabase.from('levels_master').select('*').order('min_xp', { ascending: true });
  if (error) throw error;
  return data;
};

export const updateLevels = async (levels: any[]) => {
  // 1. Get existing levels
  const { data: existing } = await supabaseAdmin.from('levels_master').select('id');
  const incomingIds = levels.filter(l => l.id).map(l => l.id);
  const toDelete = existing?.map(e => e.id).filter(id => !incomingIds.includes(id)) || [];

  // 2. Delete removed levels
  if (toDelete.length > 0) {
    await supabaseAdmin.from('levels_master').delete().in('id', toDelete);
  }

  // 3. Upsert incoming levels
  const validUpserts = levels.map(l => {
    const item = { ...l };
    if (!item.id) delete item.id; // DB will generate ID for new ones
    return item;
  });

  const { data, error } = await supabaseAdmin.from('levels_master').upsert(validUpserts).select();
  if (error) throw error;
  return data;
};
