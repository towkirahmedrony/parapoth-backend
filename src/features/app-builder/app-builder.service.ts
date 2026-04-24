import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';

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
  const { data, error } = await supabase.from('app_configs').select('value').eq('key', 'theme_config').single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.value || null;
};

export const updateXPRules = async (rules: any) => {
  const { data, error } = await supabaseAdmin.from('app_configs').upsert({ key: 'xp_rules', value: rules }, { onConflict: 'key' }).select().single();
  if (error) throw error;
  return data;
};

export const updateGlobalNotice = async (noticeData: any) => {
  const { data, error } = await supabaseAdmin.from('app_configs').upsert({ key: 'global_notice', value: noticeData }, { onConflict: 'key' }).select().single();
  if (error) throw error;
  return data;
};

export const getLevels = async () => {
  const { data, error } = await supabase.from('levels_master').select('*').order('min_xp', { ascending: true });
  if (error) throw error;
  return data;
};

export const updateLevels = async (levels: any[]) => {
  const { data: existing } = await supabaseAdmin.from('levels_master').select('id');
  const incomingIds = levels.filter(l => l.id).map(l => l.id);
  const toDelete = existing?.map(e => e.id).filter(id => !incomingIds.includes(id)) || [];

  if (toDelete.length > 0) {
    await supabaseAdmin.from('levels_master').delete().in('id', toDelete);
  }

  const validUpserts = levels.map(l => {
    const item = { ...l };
    if (!item.id) delete item.id; 
    return item;
  });

  const { data, error } = await supabaseAdmin.from('levels_master').upsert(validUpserts).select();
  if (error) throw error;
  return data;
};
