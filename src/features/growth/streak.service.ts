import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { sendRewardNotification } from '../notifications/notifications.service';

export const getStreakStats = async (userId: string) => {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('current_streak, total_xp, coin_balance, freezes_left')
    .eq('id', userId)
    .single();
    
  if (profileErr) throw profileErr;

  let currentStreak = profile.current_streak || 0;

  // Lazy Streak Reset Check
  if (currentStreak > 0) {
    const bdTime = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
    const todayStr = bdTime.toISOString().split('T')[0];

    const { data: lastActivity } = await supabaseAdmin
      .from('user_daily_activities')
      .select('activity_date, exams_taken, used_freeze')
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastActivity && lastActivity.activity_date) {
      const lastActivityStr = lastActivity.activity_date.split('T')[0];
      
      const tDate = new Date(todayStr);
      const lDate = new Date(lastActivityStr);
      const diffDays = Math.floor((tDate.getTime() - lDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays >= 2) {
        console.log(`[Streak Reset] Resetting streak to 0 for user ${userId}`);
        await supabaseAdmin.from('profiles').update({ current_streak: 0 }).eq('id', userId);
        currentStreak = 0;
      }
    } else {
      console.log(`[Streak Reset] No activity found. Resetting streak to 0 for user ${userId}`);
      await supabaseAdmin.from('profiles').update({ current_streak: 0 }).eq('id', userId);
      currentStreak = 0;
    }
  }

  const { data: longestStreakData, error: rpcErr } = await supabase.rpc('get_longest_streak', { p_user_id: userId });
  if (rpcErr) throw rpcErr;
  
  return {
    current_streak: currentStreak, 
    total_xp: profile.total_xp || 0, 
    coin_balance: profile.coin_balance || 0,
    freezesLeft: profile.freezes_left ?? 2, 
    freezes_left: profile.freezes_left ?? 2,
    longest_streak: longestStreakData && longestStreakData.length > 0 ? longestStreakData[0] : null
  };
};

export const getHeatmap = async (userId: string) => {
  const { data, error } = await supabase.from('user_daily_activities').select('activity_date, exams_taken, study_time_minutes, xp_earned, used_freeze').eq('user_id', userId).order('activity_date', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const getDailyQuests = async (userId: string) => {
  const { data, error } = await supabase.from('user_quest_progress').select(`id, is_completed, progress_count, daily_quests ( id, title, target_count, xp_reward, coin_reward, icon_url )`).eq('user_id', userId);
  if (error) throw error;
  return data;
};

export const incrementStreakOnExamSubmit = async (userId: string) => {
  if (!userId) return;
  try {
    const bdTime = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
    const today = bdTime.toISOString().split('T')[0];
    const yesterdayDate = new Date(bdTime.getTime() - 24 * 60 * 60 * 1000);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    const { data: activity } = await supabaseAdmin.from('user_daily_activities').select('id, exams_taken').eq('user_id', userId).eq('activity_date', today).maybeSingle();
    const examsTaken = activity?.exams_taken || 0;

    if (examsTaken === 0) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('current_streak').eq('id', userId).maybeSingle();
      if (!profile) return;

      const { data: yesterdayActivity } = await supabaseAdmin.from('user_daily_activities').select('exams_taken, used_freeze').eq('user_id', userId).eq('activity_date', yesterday).maybeSingle();
      const isStreakMaintained = yesterdayActivity && (yesterdayActivity.exams_taken > 0 || yesterdayActivity.used_freeze);
      
      let newStreak = isStreakMaintained ? (profile?.current_streak || 0) + 1 : 1;
      await supabaseAdmin.from('profiles').update({ current_streak: newStreak }).eq('id', userId);

      const { data: configData } = await supabaseAdmin.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
      const rules = (configData?.value as any) || {};

      let xpReward = rules.daily_login || 10;
      let notifTitle = "ডেইলি গোল পূরণ! 🎉";
      let notifBody = `আজকের প্রথম পড়ার জন্য আপনি পেয়েছেন ${xpReward} XP!`;

      if (newStreak > 0 && newStreak % 30 === 0) {
        xpReward += (rules.streak_30_days || 300);
        notifTitle = "🔥 ৩০ দিনের ফায়ার স্ট্রিক!";
        notifBody = `অসাধারণ! টানা ৩০ দিন পড়াশোনা করার জন্য বোনাস হিসেবে পেয়েছেন সর্বমোট ${xpReward} XP!`;
      } else if (newStreak > 0 && newStreak % 7 === 0) {
        xpReward += (rules.streak_7_days || 50);
        notifTitle = "🔥 ৭ দিনের স্ট্রিক!";
        notifBody = `দারুণ! টানা ৭ দিন পড়াশোনা করার জন্য বোনাস হিসেবে পেয়েছেন সর্বমোট ${xpReward} XP!`;
      }

      await supabaseAdmin.rpc('update_user_progress', { p_user_id: userId, p_coins: 0, p_xp: xpReward });
      await sendRewardNotification(userId, notifTitle, notifBody, 0, xpReward);

      if (activity) {
        await supabaseAdmin.from('user_daily_activities').update({ exams_taken: 1 }).eq('id', activity.id);
      } else {
        await supabaseAdmin.from('user_daily_activities').insert({ user_id: userId, activity_date: today, exams_taken: 1, study_time_minutes: 0, xp_earned: xpReward });
      }
    }
  } catch (error) {
    console.error('❌ [STREAK LOG] Critical Server Error:', error);
  }
};
