import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { UpdateProfileDto, UserProfile } from './profile.types';
import { sendRewardNotification } from '../notifications/notifications.service';

export class ProfileService {
  static async getProfileById(userId: string): Promise<UserProfile> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw new Error('Profile not found');
    return data as UserProfile;
  }

  static async updateProfile(userId: string, data: UpdateProfileDto) {
    // আগের প্রোফাইল চেক করা হচ্ছে এক্সপি রিওয়ার্ডের জন্য
    const { data: oldProfile } = await supabase.from('profiles').select('avatar_url, institution, class_level').eq('id', userId).single();
    
    const { data: updated, error } = await supabase.from('profiles').update(data).eq('id', userId).select().single();
    if (error) throw new Error(error.message);

    // প্রোফাইল ১০০% সম্পন্ন হলে XP দেওয়ার লজিক
    if (oldProfile && updated) {
      const wasIncomplete = !oldProfile.avatar_url || !oldProfile.institution || !oldProfile.class_level;
      const isNowComplete = updated.avatar_url && updated.institution && updated.class_level;

      if (wasIncomplete && isNowComplete) {
        const { data: configData } = await supabaseAdmin.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
        const xpReward = (configData?.value as any)?.profile_completion || 50;
        
        const { error: xpErr } = await supabaseAdmin.rpc('update_user_progress', { p_user_id: userId, p_coins: 0, p_xp: xpReward });
        if (!xpErr) {
          // নোটিফিকেশন পাঠানোর ক্ষেত্রে error catch করা হলো যেন মেইন ফ্লো না ভাঙ্গে
          sendRewardNotification(userId, 'প্রোফাইল সম্পন্ন হয়েছে! 🎉', `আপনার প্রোফাইলে প্রয়োজনীয় তথ্য যুক্ত করার জন্য আপনি পেয়েছেন ${xpReward} XP!`, 0, xpReward).catch(console.error);
        }
      }
    }
    return updated;
  }

  static async updateThemePreference(userId: string, theme: string) {
    const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).single();
    
    const currentSettings = (profile?.settings as Record<string, any>) || {};
    const updatedSettings = { ...currentSettings, theme };

    const { data, error } = await supabase
      .from('profiles')
      .update({ settings: updatedSettings })
      .eq('id', userId)
      .select('settings')
      .single();

    if (error) throw new Error(error.message);
    return data?.settings;
  }

  static async getPublicProfile(identifier: string) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
    let query = supabase.from('profiles').select('id, username, full_name, avatar_url, bio, total_xp, pvp_rating, current_streak, batch_year, institution, class_level');
    
    if (isUUID) query = query.eq('id', identifier);
    else query = query.eq('username', identifier);
    
    const { data, error } = await query.single();
    if (error) throw new Error('User not found');
    return data;
  }

  static async getUserBadges(userId: string) {
    // ডাটাবেইজে যদি user_badges টেবিল না থাকে, তবে achievements_master এর রিলেশন দিয়ে একটি ভিউ বা টেবিল বানিয়ে নিতে হবে
    const { data, error } = await supabase.from('user_badges').select(`earned_at, badge:achievements_master (id, title, description, icon_url, rarity)`).eq('user_id', userId);
    if (error) throw new Error('Failed to fetch user badges');
    return data;
  }

  static async getActivityStats(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // ডাটাবেইজে earned_xp নেই, তাই score কলাম ফেচ করা হলো
    const { data, error } = await supabase.from('exam_history').select('created_at, score').eq('user_id', userId).gte('created_at', sevenDaysAgo.toISOString());
    if (error) throw new Error('Failed to fetch activity stats');

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const stats = days.map(day => ({ day, exams: 0, xp: 0 }));

    data.forEach((entry: any) => {
      const dayName = days[new Date(entry.created_at).getDay()];
      const dayObj = stats.find(s => s.day === dayName);
      if (dayObj) { 
        dayObj.exams += 1; 
        dayObj.xp += entry.score || 0; // earned_xp এর বদলে score যুক্ত হলো 
      }
    });

    return stats;
  }
}
