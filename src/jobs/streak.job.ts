import { supabaseAdmin } from '../config/supabaseAdmin';
import logger from '../lib/utils/logger';

export const processDailyStreaks = async () => {
  try {
    logger.info('Starting daily streak processing job...');
    
    // বাংলাদেশ সময় (UTC+6) অনুযায়ী গতকালের তারিখ বের করা
    const bdTime = new Date(new Date().getTime() + 6 * 60 * 60 * 1000);
    const yesterday = new Date(bdTime.getTime() - 24 * 60 * 60 * 1000);
    const targetDate = yesterday.toISOString().split('T')[0];

    // যাদের স্ট্রিক ১ বা তার বেশি, শুধু তাদেরকেই প্রসেস করব
    // Cron job-এ RLS বাইপাস করতে অবশ্যই supabaseAdmin ব্যবহার করতে হবে
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('profiles')
      .select('id, current_streak, freezes_left')
      .gt('current_streak', 0);

    if (usersErr) throw usersErr;
    
    if (!users || users.length === 0) {
      logger.info('No active streaks found to process.');
      return;
    }

    let frozenCount = 0;
    let brokenCount = 0;

    for (const user of users) {
      // চেক করি গতকাল কোনো পরীক্ষা দিয়েছে কি না (.single() এর বদলে .maybeSingle() ব্যবহার করা হলো)
      const { data: activity } = await supabaseAdmin
        .from('user_daily_activities')
        .select('exams_taken, used_freeze')
        .eq('user_id', user.id)
        .eq('activity_date', targetDate)
        .maybeSingle();

      const tookExam = activity && (activity.exams_taken || 0) > 0;
      const alreadyFrozen = activity && activity.used_freeze;

      // যদি পরীক্ষা না দেয় এবং আগে থেকে ফ্রিজও না হয়ে থাকে
      if (!tookExam && !alreadyFrozen) {
        if ((user.freezes_left || 0) > 0) {
          // ফ্রিজ কোটা বাকি আছে, তাই ফ্রিজ ব্যবহার করে স্ট্রিক বাঁচাবো
          await supabaseAdmin.from('profiles').update({ 
            freezes_left: user.freezes_left - 1 
          }).eq('id', user.id);

          await supabaseAdmin.from('user_daily_activities').upsert({
            user_id: user.id,
            activity_date: targetDate,
            used_freeze: true,
            exams_taken: 0,
            study_time_minutes: 0,
            xp_earned: 0
          }, { onConflict: 'user_id, activity_date' });
          
          frozenCount++;
        } else {
          // ফ্রিজ কোটা শেষ, তাই স্ট্রিক ভেঙে যাবে
          await supabaseAdmin.from('profiles').update({ 
            current_streak: 0 
          }).eq('id', user.id);
          brokenCount++;
        }
      }
    }
    logger.info(`Streak processing completed. Protected: ${frozenCount}, Broken: ${brokenCount}`);
  } catch (error) {
    logger.error('Error in daily streak processing:', error);
  }
};

export const resetMonthlyFreezes = async () => {
  try {
    logger.info('Resetting monthly freezes for all users...');
    // মাসের ১ তারিখে সবার ফ্রিজ ২ তে রিসেট করে দেওয়া
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ freezes_left: 2 })
      .not('id', 'is', null); 
    
    if (error) throw error;
    logger.info('Monthly freezes reset successfully.');
  } catch (error) {
    logger.error('Error resetting monthly freezes:', error);
  }
};
