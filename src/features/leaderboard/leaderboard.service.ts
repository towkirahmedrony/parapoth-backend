import { supabase } from '../../config/supabase';
import { LeaderboardUser, SquadRank } from './leaderboard.types';

export const leaderboardService = {
  // গ্লোবাল ইউজার লিডারবোর্ড (Leagues)
  async getGlobalLeaderboard(minXp: number, maxXp: number, userId: string) {
    const { data: users, error } = await supabase
      .from('profiles')
      // username এবং current_streak যোগ করা হলো
      .select('id, username, full_name, avatar_url, institution, total_xp, current_streak')
      .gte('total_xp', minXp)
      .lt('total_xp', maxXp)
      .order('total_xp', { ascending: false })
      .limit(50);

    if (error) throw error;

    return users.map((user, index) => ({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      institution: user.institution,
      total_score: user.total_xp, // ফ্রন্টএন্ডের total_score এর সাথে ম্যাপ করা হলো
      current_streak: user.current_streak || 0,
      rank: index + 1,
      is_current_user: user.id === userId
    }));
  },

  // গ্রুপ/স্কোয়াড লিডারবোর্ড
  async getGroupLeaderboard(userId: string) {
    // ১. সব গ্রুপের টপ লিডারবোর্ড আনা
    const { data: topGroups, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, icon, group_level, total_xp')
      .order('total_xp', { ascending: false })
      .limit(20);

    if (groupsError) throw groupsError;

    // ২. ইউজার কোন গ্রুপের মেম্বার কিনা তা চেক করা
    const { data: membership, error: memberError } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, icon, group_level, total_xp)')
      .eq('user_id', userId)
      .single();

    let myGroup: SquadRank | null = null;
    
    if (membership && membership.groups) {
        // এখানে র‍্যাংক ক্যালকুলেট করার জন্য একটি আলাদা কুয়েরি করা যেতে পারে
        // আপাতত সিম্পল রাখার জন্য ডামি র‍্যাংক বা কাউন্ট ইউজ করা যায়
        const g = membership.groups as any;
        myGroup = {
            id: g.id,
            name: g.name,
            icon: g.icon,
            group_level: g.group_level,
            total_xp: g.total_xp,
            rank: 0 // বাস্তব প্রোজেক্টে এখানে count দিয়ে র‍্যাংক বের করতে হবে
        };
    }

    return {
      hasGroup: !!membership,
      myGroup,
      topGroups: topGroups.map((g, i) => ({ ...g, rank: i + 1 }))
    };
  }
};
