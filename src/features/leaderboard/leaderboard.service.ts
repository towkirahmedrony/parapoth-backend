import { supabase } from '../../config/supabase';
import { LeaderboardUser, SquadRank } from './leaderboard.types';

export const leaderboardService = {
  async getGlobalLeaderboard(minXp: number, maxXp: number | null, userId: string) {
    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, institution, total_xp, current_streak')
      .eq('is_email_verified', true) // শুধুমাত্র ভেরিফাইড ইউজারদের দেখানোর জন্য এই ফিল্টারটি যোগ করা হয়েছে
      .gte('total_xp', minXp)
      .order('total_xp', { ascending: false })
      .limit(50);

    // Upper bound must be exclusive to avoid overlap with next league
    if (maxXp !== null) {
      query = query.lt('total_xp', maxXp);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    return (users || []).map((user, index) => ({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      institution: user.institution,
      total_xp: user.total_xp ?? 0,
      total_score: user.total_xp ?? 0,
      current_streak: user.current_streak || 0,
      rank: index + 1,
      is_current_user: user.id === userId
    }));
  },

  async getLeaguesConfig() {
    const { data, error } = await supabase
      .from('levels_master')
      .select('*')
      .order('min_xp', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getGroupLeaderboard(userId: string) {
    const { data: topGroups, error: groupsError } = await supabase
      .from('study_groups')
      .select('id, name, icon, group_level, total_xp')
      .order('total_xp', { ascending: false })
      .limit(20);

    if (groupsError) throw groupsError;

    const { data: membership } = await supabase
      .from('group_members')
      .select('group_id, study_groups(id, name, icon, group_level, total_xp)')
      .eq('user_id', userId)
      .single();

    let myGroup: SquadRank | null = null;

    if (membership && membership.study_groups) {
      const g = membership.study_groups as any;
      myGroup = {
        id: g.id,
        name: g.name,
        icon: g.icon,
        group_level: g.group_level,
        total_xp: g.total_xp,
        rank: 0
      };
    }

    return {
      hasGroup: !!membership,
      myGroup,
      topGroups: (topGroups || []).map((g, i) => ({ ...g, rank: i + 1 }))
    };
  }
};
