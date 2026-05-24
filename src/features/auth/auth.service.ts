import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { Profile } from './auth.types';
import crypto from 'crypto';

export const authService = {
  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw new Error(`Profile fetch error: ${error.message}`);
    return data as Profile;
  },

  async updateLastActive(userId: string): Promise<void> {
    await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId);
  },

  async getUserRole(userId: string): Promise<string> {
    const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('is_active', true).single();
    if (error) return 'student'; // Default role fallback
    return data?.role || 'student';
  },

  async getUserPermissions(role: string): Promise<string[]> {
    const { data, error } = await supabase.from('role_permissions').select('permissions(action)').eq('role', role);
    if (error) return [];
    return data?.map((item: any) => item.permissions?.action).filter(Boolean) || [];
  },

  async save2FASecret(userId: string, secret: string): Promise<void> {
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).single();
    const currentSettings = (profile?.settings as Record<string, any>) || {};
    await supabase.from('profiles').update({ 
      settings: { ...currentSettings, two_factor_secret: secret } 
    }).eq('id', userId);
  },

  async enable2FA(userId: string): Promise<void> {
    await supabase.from('profiles').update({ is_2fa_enabled: true }).eq('id', userId);
  },

  async get2FASecret(userId: string): Promise<string | null> {
    const { data } = await supabase.from('profiles').select('settings').eq('id', userId).single();
    const settings = data?.settings as Record<string, any> | null;
    return settings?.two_factor_secret || null;
  },

  async saveTrustedDevice(userId: string, deviceToken: string, ipAddress: string): Promise<void> {
    await supabase.from('admin_sessions').insert({ 
      admin_id: userId, 
      device_id: deviceToken, 
      is_2fa_verified: true, 
      last_active: new Date().toISOString() 
    });
  },

  async saveUserDevice(payload: any): Promise<void> {
    const deviceId = payload.device_id || crypto.randomUUID();
    const ipToSave = payload.ip_address && payload.ip_address.trim() !== '' ? payload.ip_address : '0.0.0.0';

    const { error } = await supabaseAdmin.from('user_devices').insert([{
      user_id: payload.user_id,
      device_name: payload.device_name || 'Unknown',
      device_id: deviceId,
      fcm_token: payload.fcm_token || null,
      last_active_at: new Date().toISOString(),
      is_trusted: true,
      os_or_browser: payload.os_or_browser || 'Unknown',
      ip_address: ipToSave
    }]);

    if (error) throw new Error(`Device save error: ${error.message}`);
  },

  async isDeviceTrusted(userId: string, deviceToken: string): Promise<boolean> {
    const { data, error } = await supabase.from('admin_sessions')
      .select('id')
      .eq('admin_id', userId)
      .eq('device_id', deviceToken)
      .eq('is_2fa_verified', true)
      .single();
    return !error && !!data;
  }
};
