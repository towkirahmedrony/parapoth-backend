import { supabase } from '../../config/supabase';
import { User360Response } from './users.admin.types';

export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Supabase Error:', error.message);
    throw new Error(`Database Error: ${error.message}`);
  }
  return data;
};

export const adjustUserBalance = async (userId: string, amount: number, reason: string) => {
  // ১. ইউজারের বর্তমান ব্যালেন্স চেক করা
  const { data: user, error: fetchError } = await supabase
    .from('profiles')
    .select('coin_balance')
    .eq('id', userId)
    .single();

  if (fetchError || !user) {
    throw new Error('User not found in database.');
  }

  const currentBalance = user.coin_balance || 0;
  const newBalance = currentBalance + amount;

  // ২. profiles টেবিলে নতুন ব্যালেন্স আপডেট করা
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ coin_balance: newBalance })
    .eq('id', userId);

  if (updateError) {
    throw new Error('Failed to update user balance in database.');
  }

  // ৩. অডিট লগের জন্য coin_transactions টেবিলে রেকর্ড রাখা
  const { error: logError } = await supabase
    .from('coin_transactions')
    .insert({
      user_id: userId,
      amount: amount,
      transaction_type: 'admin_adjustment',
      description: reason
    });

  if (logError) {
    console.error("Failed to save transaction log:", logError);
  }

  return { newBalance };
};

export const getUser360Profile = async (userId: string): Promise<User360Response> => {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) throw new Error('User profile not found');

  const queries = await Promise.all([
    supabase.from('exam_history').select('id, score, total_marks, rank, correct_count, wrong_count, skipped_count, is_timeout, device_type, created_at, exam_papers(title)').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('bookmarks').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('wrong_answers').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('group_members').select('role, contribution_xp, joined_at, study_groups(id, name, icon, group_level, last_activity_date)').eq('user_id', userId).single(),
    supabase.from('user_subscriptions').select('id, start_date, end_date, status, auto_renewal, subscription_plans(name)').eq('user_id', userId).order('end_date', { ascending: false }),
    supabase.from('coin_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('payment_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('user_quest_progress').select('id, is_completed, progress_count, daily_quests(title, target_count)').eq('user_id', userId),
    supabase.from('user_devices').select('*').eq('user_id', userId).order('last_active_at', { ascending: false }),
    supabase.from('user_reports').select('*').eq('reporter_user_id', userId).order('created_at', { ascending: false }),
    supabase.from('audit_logs').select('*').eq('target_id', userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('user_warnings').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  ]);

  // Fetching focus sessions manually for aggregation
  const focusStarted = await supabase.from('group_focus_sessions').select('id, duration_minutes').eq('started_by', userId);
  const totalFocusMins = focusStarted.data?.reduce((acc: any, curr: any) => acc + (curr.duration_minutes || 0), 0) || 0;

  return {
    profile,
    recent_exams: queries[0].data?.map((e: any) => ({ ...e, title: Array.isArray(e.exam_papers) ? e.exam_papers[0]?.title : e.exam_papers?.title || 'Unknown Exam' })) || [],
    exam_stats: { total_exams: 0, accuracy_rate: 0, strong_subjects: [], weak_subjects: [] },
    academic_engagement: { bookmarks_count: queries[1].count || 0, wrong_answers_count: queries[2].count || 0 },
    group_details: queries[3].data ? { 
      role: queries[3].data.role, 
      contribution_xp: queries[3].data.contribution_xp, 
      joined_at: queries[3].data.joined_at, 
      ...((Array.isArray(queries[3].data.study_groups) ? queries[3].data.study_groups[0] : queries[3].data.study_groups) || {}) 
    } : null,
    pvp_stats: { played: profile.pvp_matches_played || 0, won: profile.pvp_matches_won || 0 },
    subscription_history: queries[4].data?.map((s: any) => ({ ...s, plan_id: Array.isArray(s.subscription_plans) ? s.subscription_plans[0]?.name : s.subscription_plans?.name || 'Unknown Plan' })) || [],
    coin_transactions: queries[5].data || [],
    payment_requests: queries[6].data || [],
    quests: queries[7].data?.map((q: any) => ({ 
      id: q.id, 
      is_completed: q.is_completed, 
      progress_count: q.progress_count, 
      title: Array.isArray(q.daily_quests) ? q.daily_quests[0]?.title : q.daily_quests?.title || 'Quest', 
      target_count: Array.isArray(q.daily_quests) ? q.daily_quests[0]?.target_count : q.daily_quests?.target_count || 1 
    })) || [],
    devices: queries[8].data || [],
    support_tickets: queries[9].data || [],
    audit_logs: queries[10].data || [],
    warnings: queries[11].data || [],
    focus_sessions_started: focusStarted.data?.length || 0,
    focus_sessions_joined: focusStarted.data?.length || 0,
    total_focus_minutes: totalFocusMins,
    longest_streak: profile.current_streak || 0
  };
};
