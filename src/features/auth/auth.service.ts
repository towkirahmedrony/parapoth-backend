import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { Profile } from './auth.types';
import jwt from 'jsonwebtoken';
import { ReferralService } from '../referral/referral.service';

export const authService = {
  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    if (!data) throw new Error('Profile not found');
    if (data.account_status !== 'active') throw new Error(`Account ${data.account_status}. Please contact support.`);
    
    // --- Auto Referral Logic ---
    this.checkAndProcessReferral(userId).catch(err => 
      console.error('Background auto-referral processing error:', err)
    );

    return data as Profile;
  },

  async checkAndProcessReferral(userId: string): Promise<void> {
    const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !userData?.user) return;

    const referredByCode = userData.user.user_metadata?.referred_by_code;
    
    if (referredByCode) {
      await ReferralService.processAutoReferral(userId, referredByCode);
    }
  },

  async updateLastActive(userId: string): Promise<void> {
    const { error } = await supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', userId);
    if (error) console.error('Failed to update activity log:', error);
  },

  async getUserRole(userId: string): Promise<string> {
    const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('is_active', true).single();
    if (error && error.code !== 'PGRST116') console.error('Error fetching role:', error.message);
    return data?.role || 'student';
  },

  async getUserPermissions(role: string): Promise<string[]> {
    const { data, error } = await supabase.from('role_permissions').select('permission_id, permissions(action)').eq('role', role);
    if (error) return [];
    return data.map((item: any) => item.permissions?.action).filter(Boolean);
  },

  async save2FASecret(userId: string, secret: string): Promise<void> {
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).single();
    const currentSettings = profile?.settings || {};
    const { error } = await supabase.from('profiles').update({ settings: { ...currentSettings, two_factor_secret: secret } }).eq('id', userId);
    if (error) throw new Error('Failed to save 2FA secret');
  },

  async enable2FA(userId: string): Promise<void> {
    const { error } = await supabase.from('profiles').update({ is_2fa_enabled: true }).eq('id', userId);
    if (error) throw new Error('Failed to enable 2FA');
  },

  async get2FASecret(userId: string): Promise<string | null> {
    const { data, error } = await supabase.from('profiles').select('settings').eq('id', userId).single();
    if (error || !data?.settings) return null;
    return (data.settings as any).two_factor_secret || null;
  },

  async saveTrustedDevice(userId: string, deviceToken: string): Promise<void> {
    const { error } = await supabase.from('admin_sessions').insert({ admin_id: userId, device_id: deviceToken, is_2fa_verified: true, last_active: new Date().toISOString() });
    if (error) throw new Error('Failed to save trusted device');
  },

  async isDeviceTrusted(userId: string, deviceToken: string): Promise<boolean> {
    const { data, error } = await supabase.from('admin_sessions').select('id').eq('admin_id', userId).eq('device_id', deviceToken).eq('is_2fa_verified', true).single();
    return !error && !!data;
  },

  generateTempToken(userId: string): string {
    return jwt.sign({ id: userId, type: '2fa_temp' }, process.env.JWT_SECRET || 'your_super_secret_key', { expiresIn: '5m' });
  },

  verifyTempToken(token: string): any {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_super_secret_key') as any;
      if (decoded.type !== '2fa_temp') throw new Error('Invalid token type.');
      return decoded;
    } catch (err: any) {
      throw new Error('Temporary token is invalid or has expired. Please login again.');
    }
  },

  async grantSignupXP(userId: string): Promise<void> {
    const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
    // According to frontend: Signup Bonus (Coins for new user)
    const coins = (data?.value as any)?.signup_bonus || 50; 
    await supabase.rpc('update_user_progress', { p_coins: coins, p_user_id: userId, p_xp: 0 });
  },

  async grantProfileCompletionXP(userId: string): Promise<void> {
    const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
    const xp = (data?.value as any)?.profile_completion || 50;
    await supabase.rpc('update_user_progress', { p_coins: 0, p_user_id: userId, p_xp: xp });
  }
};
