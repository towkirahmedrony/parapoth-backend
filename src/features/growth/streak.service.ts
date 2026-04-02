import { supabase } from '../../config/supabase';

// Get current streak, total XP, and longest streak
export const getStreakStats = async (userId: string) => {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('current_streak, total_xp, coin_balance')
    .eq('id', userId)
    .single();

  if (profileErr) throw profileErr;

  // Fetch longest streak using the existing RPC function
  const { data: longestStreakData, error: rpcErr } = await supabase
    .rpc('get_longest_streak', { p_user_id: userId });

  if (rpcErr) throw rpcErr;

  // ফ্রন্টএন্ডে পুরো অবজেক্ট দরকার (days, start_date, end_date), শুধু সংখ্যা নয়
  const longestStreak = longestStreakData && longestStreakData.length > 0 
    ? longestStreakData[0] 
    : null;

  return {
    current_streak: profile.current_streak || 0,
    total_xp: profile.total_xp || 0,
    coin_balance: profile.coin_balance || 0,
    longest_streak: longestStreak
  };
};

// Get user activity heatmap data
export const getHeatmap = async (userId: string) => {
  const { data, error } = await supabase
    .rpc('get_user_heatmap', { p_user_id: userId });

  if (error) throw error;
  
  // ফ্রন্টএন্ড 'activity_date' এক্সপেক্ট করে, কিন্তু ডাটাবেইজ দেয় 'cal_date'
  // তাই ফ্রন্টএন্ডের সুবিধার জন্য এখানে ফিল্ডের নাম ম্যাপ করে দেওয়া হলো
  return data?.map((item: any) => ({
    ...item,
    activity_date: item.cal_date 
  })) || [];
};

// Get today's quest progress
export const getDailyQuests = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_quest_progress')
    .select(`
      id, 
      is_completed, 
      progress_count,
      daily_quests ( id, title, target_count, xp_reward, coin_reward, icon_url )
    `)
    .eq('user_id', userId);
    
  if (error) throw error;
  return data;
};
