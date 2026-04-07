import { supabase } from '../../config/supabase';

// --- CAMPAIGNS ---
export const createCampaign = async (campaignData: any, adminId: string) => {
  const { data, error } = await supabase.from('notifications').insert({ ...campaignData, created_by: adminId, status: 'scheduled', total_sent: 0, total_clicks: 0 }).select().single();
  if (error) throw new Error(error.message); return data;
};
export const getCampaigns = async () => {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return data;
};
export const cancelCampaign = async (id: string) => {
  const { data, error } = await supabase.from('notifications').update({ status: 'cancelled' }).eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};
export const updateCampaign = async (id: string, payload: any) => {
  const { data, error } = await supabase.from('notifications').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};
export const deleteCampaign = async (id: string) => {
  const { data, error } = await supabase.from('notifications').delete().eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};

// --- GLOBAL NOTICES ---
export const createNotice = async (noticeData: any, adminId: string) => {
  const { data, error } = await supabase.from('notices').insert({ ...noticeData, created_by: adminId }).select().single();
  if (error) throw new Error(error.message); return data;
};
export const getNotices = async () => {
  const { data, error } = await supabase.from('notices').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return data;
};
export const updateNotice = async (id: string, payload: any) => {
  const { data, error } = await supabase.from('notices').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};
export const deleteNotice = async (id: string) => {
  const { data, error } = await supabase.from('notices').delete().eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};
