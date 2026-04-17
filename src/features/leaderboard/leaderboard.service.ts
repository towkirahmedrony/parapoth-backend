import { supabase } from '../../config/supabase';
import { LeaderboardUser, SquadRank } from './leaderboard.types';

export const leaderboardService = {
  // Global User Leaderboard (Leagues)
  async getGlobalLeaderboard(minXp: number, maxXp: number | null, userId: string) {
    let query = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, institution, total_xp, current_streak')
      .gte('total_xp', minXp)
      .order('total_xp', { ascending: false })
      .limit(50);

    // Only apply max_xp filter if it's not null (null means infinite max for the highest tier)
    if (maxXp !== null) {
      query = query.lte('total_xp', maxXp);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    return users.map((user, index) => ({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      institution: user.institution,
      total_score: user.total_xp, // Mapped to frontend total_score
      current_streak: user.current_streak || 0,
      rank: index + 1,
      is_current_user: user.id === userId
    }));
  },

  // Fetch League Rules
  async getLeaguesConfig() {
    const { data, error } = await supabase
      .from('levels_master')
      .select('*')
      .order('min_xp', { ascending: true });
      
    if (error) throw error;
    return data;
  },

  // Group/Squad Leaderboard
  async getGroupLeaderboard(userId: string) {
    // 1. Fetch top groups (using study_groups matching your supabase schema)
    const { data: topGroups, error: groupsError } = await supabase
      .from('study_groups')
      .select('id, name, icon, group_level, total_xp')
      .order('total_xp', { ascending: false })
      .limit(20);

    if (groupsError) throw groupsError;

    // 2. Check user membership
    const { data: membership, error: memberError } = await supabase
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
            rank: 0 // In a real project, calculate real rank using COUNT
        };
    }

    return {
      hasGroup: !!membership,
      myGroup,
      topGroups: topGroups.map((g, i) => ({ ...g, rank: i + 1 }))
    };
  }
};
