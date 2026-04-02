import { supabase } from '../../config/supabase';

/**
 * Utility function to handle Supabase errors consistently
 */
const handleSupabaseError = (error: any, context: string) => {
  if (error) {
    console.error(`❌ [Supabase Error in ${context}]:`, error.message || error);
    throw new Error(`${context}: ${error.message || JSON.stringify(error)}`);
  }
};

/**
 * Calculates percentage trend between today and yesterday
 */
const calculateTrend = (todayValue: number, yesterdayValue: number): number => {
  if (yesterdayValue === 0) return todayValue > 0 ? 100 : 0;
  const difference = todayValue - yesterdayValue;
  return Number(((difference / yesterdayValue) * 100).toFixed(1));
};

export const getLiveMetrics = async () => {
  const now = new Date();
  
  // Today boundaries
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTodayIso = startOfToday.toISOString();

  // Yesterday boundaries
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfYesterdayIso = startOfYesterday.toISOString();

  const [
    activeUsersRes,
    todayRegistrationsRes,
    yesterdayRegistrationsRes,
    todayRevenueRes,
    yesterdayRevenueRes
  ] = await Promise.all([
    // Active profiles count
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('account_status', 'active'),
    
    // Registrations
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayIso),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfYesterdayIso).lt('created_at', startOfTodayIso),
    
    // Revenue based on approved payment requests
    supabase.from('payment_requests').select('amount').eq('status', 'approved').gte('updated_at', startOfTodayIso),
    supabase.from('payment_requests').select('amount').eq('status', 'approved').gte('updated_at', startOfYesterdayIso).lt('updated_at', startOfTodayIso)
  ]);

  handleSupabaseError(activeUsersRes.error, 'getLiveMetrics (activeUsers)');
  handleSupabaseError(todayRegistrationsRes.error, 'getLiveMetrics (todayRegistrations)');
  handleSupabaseError(yesterdayRegistrationsRes.error, 'getLiveMetrics (yesterdayRegistrations)');
  handleSupabaseError(todayRevenueRes.error, 'getLiveMetrics (todayRevenue)');
  handleSupabaseError(yesterdayRevenueRes.error, 'getLiveMetrics (yesterdayRevenue)');

  const todayRegistrationsCount = todayRegistrationsRes.count || 0;
  const yesterdayRegistrationsCount = yesterdayRegistrationsRes.count || 0;

  const todayRevenue = todayRevenueRes.data?.reduce((sum, req) => sum + (req.amount || 0), 0) || 0;
  const yesterdayRevenue = yesterdayRevenueRes.data?.reduce((sum, req) => sum + (req.amount || 0), 0) || 0;

  return {
    activeUsers: activeUsersRes.count || 0,
    todayRegistrations: todayRegistrationsCount,
    todayRevenue,
    usersTrend: 0, // Need historical daily active users table to calculate this accurately
    registrationsTrend: calculateTrend(todayRegistrationsCount, yesterdayRegistrationsCount),
    revenueTrend: calculateTrend(todayRevenue, yesterdayRevenue),
  };
};

export const getActiveExams = async () => {
  const nowIso = new Date().toISOString();

  // Fetch exams that are published and currently within their start/end time
  const { data: exams, error: examsError } = await supabase
    .from('exam_papers')
    .select('id, title')
    .eq('is_published', true)
    .lte('start_time', nowIso)
    .gte('end_time', nowIso)
    .order('start_time', { ascending: false })
    .limit(5);

  handleSupabaseError(examsError, 'getActiveExams (exams fetch)');

  if (!exams || exams.length === 0) return [];

  // For each active exam, count active participants from exam_progress
  // Assuming exam_progress rows exist for users currently taking the exam
  const examsWithParticipants = await Promise.all(
    exams.map(async (exam) => {
      const { count, error: countError } = await supabase
        .from('exam_progress')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', exam.id)
        // Optionally filter by last_updated_at to ensure they are recently active
        // .gte('last_updated_at', new Date(Date.now() - 15 * 60000).toISOString()); 

      if (countError) console.error(`Error fetching participants for exam ${exam.id}:`, countError.message);

      return {
        exam_id: exam.id,
        title: exam.title,
        active_participants: count || 0
      };
    })
  );

  return examsWithParticipants;
};

export const getSecurityAlerts = async () => {
  const { data, error } = await supabase
    .from('admin_alerts')
    .select('id, type, message, priority, created_at, is_read, action_link')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(10);

  handleSupabaseError(error, 'getSecurityAlerts');
  return data || [];
};

export const getAdminPerformance = async (adminId: string) => {
  const { data, error } = await supabase
    .from('admin_performance_stats')
    .select('month, questions_approved, support_tickets_resolved, users_banned')
    .eq('admin_id', adminId)
    .order('month', { ascending: true }) // Assuming 'month' is sortable (e.g., YYYY-MM)
    .limit(6);

  handleSupabaseError(error, 'getAdminPerformance');
  return data || [];
};

export const getPendingPayments = async () => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select(`
      id, 
      amount, 
      method, 
      trx_id, 
      created_at, 
      user_id, 
      profiles:user_id(full_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10); // Added limit for performance on dashboard

  handleSupabaseError(error, 'getPendingPayments');

  return (data || []).map((payment: any) => ({
    id: payment.id,
    user_id: payment.user_id,
    user_name: payment.profiles?.full_name || 'Unknown User',
    amount: payment.amount,
    method: payment.method || 'Unknown',
    trx_id: payment.trx_id || 'N/A',
    created_at: payment.created_at
  }));
};

export const getModerationQueue = async () => {
  const { data, error } = await supabase
    .from('user_reports')
    .select(`
      id, 
      type, 
      report_reason, 
      created_at, 
      status, 
      profiles:reporter_user_id(full_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10); // Added limit for performance on dashboard

  handleSupabaseError(error, 'getModerationQueue');

  return (data || []).map((report: any) => ({
    id: report.id,
    type: report.type,
    report_reason: report.report_reason || 'No reason provided',
    reporter_name: report.profiles?.full_name || 'Anonymous',
    created_at: report.created_at,
    status: report.status
  }));
};
