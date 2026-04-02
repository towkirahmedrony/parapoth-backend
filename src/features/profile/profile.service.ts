import { supabase } from '../../config/supabase';
import { UpdateProfileDto, UserProfile } from './profile.types';

export class ProfileService {
  // নিজের প্রোফাইল ডাটা ফেচ করা
  static async getProfileById(userId: string): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new Error('Profile not found');
    return data;
  }

  // প্রোফাইল আপডেট করা
  static async updateProfile(userId: string, data: UpdateProfileDto) {
    const { data: updated, error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated;
  }

  // পাবলিক প্রোফাইল (ইউজারনেম বা আইডি দিয়ে সার্চ)
  static async getPublicProfile(identifier: string) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
    
    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, total_xp, pvp_rating, current_streak, batch_year');

    if (isUUID) {
      query = query.eq('id', identifier);
    } else {
      query = query.eq('username', identifier);
    }

    const { data, error } = await query.single();
    if (error) throw new Error('User not found');
    return data;
  }

  // অর্জিত ব্যাজসমূহ
  static async getUserBadges(userId: string) {
    const { data, error } = await supabase
      .from('user_badges')
      .select(`
        earned_at,
        badge:achievements_master (id, title, description, icon_url, rarity)
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  }

  // লাস্ট ৭ দিনের অ্যাক্টিভিটি ডাটা (Chart এর জন্য)
  static async getActivityStats(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from('exam_history')
      .select('created_at, earned_xp')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString());

    if (error) throw error;

    // ডাটা গ্রুপিং লজিক (Day-wise)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const stats = days.map(day => ({ day, exams: 0, xp: 0 }));

    data.forEach((entry: any) => {
      const dayName = days[new Date(entry.created_at).getDay()];
      const dayObj = stats.find(s => s.day === dayName);
      if (dayObj) {
        dayObj.exams += 1;
        dayObj.xp += entry.earned_xp || 0;
      }
    });

    return stats;
  }
}
