import { supabase } from '../../config/supabase';
import { PublicProfileResponse, PlayerStats } from './profile.types';

export class ProfileService {
  static async getPublicProfile(targetId: string, currentUserId?: string): Promise<PublicProfileResponse> {
    
    // ১. টার্গেট ইউজারের ডাটা ফেচ (UUID নাকি Username চেক করে)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId);
    
    let query = supabase.from('profiles').select('*');
    
    if (isUUID) {
      query = query.eq('id', targetId);
    } else {
      query = query.eq('username', targetId);
    }

    const { data: targetUser, error: targetError } = await query.single();

    if (targetError || !targetUser) {
      throw new Error('User not found');
    }

    // ২. ব্যাজ/অ্যাচিভমেন্ট ডাটা ফেচ
    const { data: allBadges } = await supabase
      .from('achievements_master')
      .select('*');

    const userAchievements = Array.isArray(targetUser.achievements) ? targetUser.achievements : [];
    const formattedBadges = allBadges?.map(badge => ({
      id: badge.id,
      title: badge.title,
      icon_url: badge.icon_url,
      is_earned: userAchievements.includes(badge.id)
    })) || [];

    // ৩. লগ-ইন করা ইউজারের ডাটা ফেচ (Versus Stats এর জন্য)
    // currentUserId সাধারণত Auth Token থেকে আসে, তাই এটি id (UUID) থাকবে
    let myStats: PlayerStats = { total_xp: 0, accuracy: 0, current_streak: 0, total_exams: 0 };
    
    if (currentUserId && currentUserId !== targetUser.id) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('total_xp, current_streak, pvp_matches_played')
        .eq('id', currentUserId)
        .single();
        
      if (myProfile) {
        myStats = {
          total_xp: myProfile.total_xp || 0,
          accuracy: 0, 
          current_streak: myProfile.current_streak || 0,
          total_exams: myProfile.pvp_matches_played || 0
        };
      }
    } else if (currentUserId === targetUser.id) {
       // ইউজার যদি নিজের প্রোফাইলই দেখে
       myStats = {
        total_xp: targetUser.total_xp || 0,
        accuracy: 0,
        current_streak: targetUser.current_streak || 0,
        total_exams: targetUser.pvp_matches_played || 0
      };
    }

    const theirStats: PlayerStats = {
      total_xp: targetUser.total_xp || 0, 
      accuracy: 0, 
      current_streak: targetUser.current_streak || 0, 
      total_exams: targetUser.pvp_matches_played || 0 
    };

    // ৪. অ্যাক্টিভিটি ডাটা (আপাতত ডিফল্ট)
    const activityData = [
      { day: 'শনি', you: 0, them: 0 },
      { day: 'রবি', you: 0, them: 0 },
      { day: 'সোম', you: 0, them: 0 },
      { day: 'মঙ্গল', you: 0, them: 0 },
      { day: 'বুধ', you: 0, them: 0 },
      { day: 'বৃহঃ', you: 0, them: 0 },
      { day: 'শুক্র', you: 0, them: 0 },
    ];

    return {
      profile: {
        id: targetUser.id,
        username: targetUser.username || null,
        full_name: targetUser.full_name || 'অজানা ইউজার',
        avatar_url: targetUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.full_name}`,
        bio: targetUser.bio || '',
        batch_year: targetUser.batch_year || '',
        pvp_rating: targetUser.pvp_rating || 0,
        total_xp: targetUser.total_xp || 0,
        badges: formattedBadges
      },
      versusStats: {
        my_stats: myStats,
        their_stats: theirStats
      },
      activityData
    };
  }
}
