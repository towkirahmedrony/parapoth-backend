import { supabase } from '../../config/supabase';
import { Profile } from './auth.types';

export const authService = {
  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Profile not found');

    if (data.account_status !== 'active') {
      throw new Error(`Account ${data.account_status}. Please contact support.`);
    }

    return data as Profile;
  },

  async updateLastActive(userId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) console.error('Failed to update activity log:', error);
  },

  async getUserRole(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching role:', error.message);
    }

    return data?.role || 'student';
  },

  async getUserPermissions(role: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission_id, permissions(action)')
      .eq('role', role);

    if (error) {
      console.error('Error fetching permissions:', error);
      return [];
    }
    
    return data.map((item: any) => item.permissions?.action).filter(Boolean);
  }
};
