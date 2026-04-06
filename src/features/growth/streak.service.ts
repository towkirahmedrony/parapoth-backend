import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';

export const getStreakStats = async (userId: string) => {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('current_streak, total_xp, coin_balance, freezes_left')
    .eq('id', userId)
    .single();

  if (profileErr) throw profileErr;

  const { data: longestStreakData, error: rpcErr } = await supabase
    .rpc('get_longest_streak', { p_user_id: userId });

  if (rpcErr) throw rpcErr;

  const longestStreak = longestStreakData && longestStreakData.length > 0 
    ? longestStreakData[0] 
    : null;

  return {
    current_streak: profile.current_streak || 0,
    total_xp: profile.total_xp || 0,
    coin_balance: profile.coin_balance || 0,
    freezesLeft: profile.freezes_left ?? 2,
    freezes_left: profile.freezes_left ?? 2,
    longest_streak: longestStreak
  };
};

export const getHeatmap = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_daily_activities')
    .select('activity_date, exams_taken, study_time_minutes, xp_earned, used_freeze')
    .eq('user_id', userId)
    .order('activity_date', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getDailyQuests = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_quest_progress')
    .select(`
      id, is_completed, progress_count,
      daily_quests ( id, title, target_count, xp_reward, coin_reward, icon_url )
    `)
    .eq('user_id', userId);
    
  if (error) throw error;
  return data;
};

// ==========================================
// Exam Submit হওয়ার পর Streak আপডেট করার লজিক 
// ==========================================
export const incrementStreakOnExamSubmit = async (userId: string) => {
  console.log(`\n🔥 [STREAK LOG] 1. Request received for user: ${userId}`);

  if (!userId) {
    console.error('❌ [STREAK LOG] Error: userId is undefined or null!');
    return;
  }

  try {
    // বাংলাদেশ সময় (UTC+6) অনুযায়ী তারিখ নির্ণয়
    const bdTime = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
    const today = bdTime.toISOString().split('T')[0];
    
    // গতকালের তারিখ (স্ট্রিক ব্রেক চেক করার জন্য)
    const yesterdayDate = new Date(bdTime.getTime() - 24 * 60 * 60 * 1000);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    console.log(`📅 [STREAK LOG] 2. BD Date - Today: ${today}, Yesterday: ${yesterday}`);

    // RLS বাইপাস করতে supabaseAdmin ব্যবহার করা হলো
    const { data: activity, error: activityErr } = await supabaseAdmin
      .from('user_daily_activities')
      .select('id, exams_taken')
      .eq('user_id', userId)
      .eq('activity_date', today)
      .maybeSingle();

    if (activityErr) console.error('❌ [STREAK LOG] 3. Activity fetch error:', activityErr);

    const examsTaken = activity?.exams_taken || 0;
    console.log(`📊 [STREAK LOG] 4. Exams already taken today: ${examsTaken}`);

    if (examsTaken === 0) {
      console.log(`🚀 [STREAK LOG] 5. No exam taken today yet. Fetching profile...`);

      const { data: profile, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('current_streak')
        .eq('id', userId)
        .maybeSingle(); // .single() এর বদলে .maybeSingle() যাতে ডাটা না থাকলে ক্র্যাশ না করে

      if (profileErr) {
         console.error('❌ [STREAK LOG] 6. Profile fetch error:', profileErr);
         return;
      }

      // স্ট্রিক ব্রেক লজিক: গতকাল পরীক্ষা বা ফ্রিজ ব্যবহার করেছে কিনা চেক করা
      const { data: yesterdayActivity } = await supabaseAdmin
        .from('user_daily_activities')
        .select('exams_taken, used_freeze')
        .eq('user_id', userId)
        .eq('activity_date', yesterday)
        .maybeSingle();

      const isStreakMaintained = yesterdayActivity && (yesterdayActivity.exams_taken > 0 || yesterdayActivity.used_freeze);
      
      // যদি গতকাল মেইনটেইন করে থাকে, তবে স্ট্রিক বাড়বে। নাহলে ১ থেকে শুরু হবে।
      let newStreak = 1;
      if (isStreakMaintained) {
        newStreak = (profile?.current_streak || 0) + 1;
      }

      console.log(`📈 [STREAK LOG] 7. Current: ${profile?.current_streak}, Maintained: ${isStreakMaintained}, New will be: ${newStreak}`);

      const { data: updatedProfile, error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({ current_streak: newStreak })
        .eq('id', userId)
        .select('current_streak')
        .maybeSingle();

      if (updateErr) {
         console.error('❌ [STREAK LOG] 8. Profile UPDATE error:', updateErr);
         return;
      }

      console.log(`✅ [STREAK LOG] 9. Profile updated! DB now has streak: ${updatedProfile?.current_streak}`);

      if (activity) {
        await supabaseAdmin.from('user_daily_activities').update({ exams_taken: 1 }).eq('id', activity.id);
      } else {
        await supabaseAdmin.from('user_daily_activities').insert({
            user_id: userId,
            activity_date: today,
            exams_taken: 1,
            study_time_minutes: 0,
            xp_earned: 0
        });
      }
      console.log(`🎉 [STREAK LOG] 10. Process completed successfully!\n`);
    } else {
      console.log(`ℹ️ [STREAK LOG] User already got streak for today. Skipping increment.\n`);
    }
  } catch (error) {
    console.error('❌ [STREAK LOG] Critical Server Error:', error);
  }
};
