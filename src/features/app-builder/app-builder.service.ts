import { supabaseAdmin } from '../../config/supabaseAdmin';

export const AppBuilderService = {
  // ================== APP CONFIGS (Generic) ==================
  async getAllConfigs() {
    const { data, error } = await supabaseAdmin
      .from('app_configs')
      .select('*');
    
    if (error) throw error;
    return data || [];
  },

  async getConfig(key: string) {
    const { data, error } = await supabaseAdmin
      .from('app_configs')
      .select('*')
      .eq('key', key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // Ignore Not Found error
    return data || { value: null };
  },

  async saveConfig(key: string, value: any) {
    const { data, error } = await supabaseAdmin
      .from('app_configs')
      .upsert({ key, value })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // ================== HOME GRIDS ==================
  async getHomeGrids() {
    const { data, error } = await supabaseAdmin
      .from('home_grids')
      .select('*')
      .order('serial_order', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async saveHomeGrid(gridData: any) {
    const { data, error } = await supabaseAdmin
      .from('home_grids')
      .upsert(gridData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async reorderHomeGrids(grids: { id: string, serial_order: number }[]) {
    // Supabase upsert for bulk update
    const { data, error } = await supabaseAdmin
      .from('home_grids')
      .upsert(grids, { onConflict: 'id' })
      .select();
    
    if (error) throw error;
    return data;
  },

  async deleteHomeGrid(id: string) {
    const { error } = await supabaseAdmin
      .from('home_grids')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  // ================== BANNERS ==================
  async getBanners() {
    const { data, error } = await supabaseAdmin
      .from('home_banners')
      .select('*')
      .order('sequence', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async createBanner(bannerData: any) {
    const { data, error } = await supabaseAdmin
      .from('home_banners')
      .insert(bannerData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateBanner(id: string, updates: any) {
    const { data, error } = await supabaseAdmin
      .from('home_banners')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteBanner(id: string) {
    const { error } = await supabaseAdmin
      .from('home_banners')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  // ================== LEAGUES & LEVELS ==================
  async getLevels() {
    const { data, error } = await supabaseAdmin
      .from('levels_master')
      .select('*')
      .order('min_xp', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async updateLevels(levels: any[]) {
    // First, format data to ensure empty strings for IDs are removed so DB generates them
    const formattedLevels = levels.map(level => {
      if (!level.id) delete level.id;
      return level;
    });

    const { data, error } = await supabaseAdmin
      .from('levels_master')
      .upsert(formattedLevels, { onConflict: 'id' })
      .select();
    
    if (error) throw error;
    return data;
  }
};
