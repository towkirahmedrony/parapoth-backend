import { supabase } from '../../config/supabase';

interface SupabaseErrorLike {
  message?: string;
}

interface PaymentRequestRow {
  id: string;
  amount: number | null;
  method: string | null;
  trx_id: string | null;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name?: string | null;
  } | null;
}

interface UserReportRow {
  id: string;
  type: string;
  report_reason: string | null;
  created_at: string;
  status: string;
  profiles?: {
    full_name?: string | null;
  } | null;
}

interface ExamPaperRow {
  id: string;
  title: string;
}

interface AdminPerformanceRow {
  month: string;
  questions_approved: number | null;
  support_tickets_resolved: number | null;
  users_banned: number | null;
}

interface SecurityAlertRow {
  id: string;
  type: string;
  message: string;
  priority: string;
  created_at: string;
  is_read: boolean;
  action_link: string | null;
}

interface ActiveBannerRow {
  id: string;
  title: string | null;
  action_link: string | null;
  sequence: number | null;
}

const assertNoSupabaseError = (
  error: SupabaseErrorLike | null,
  context: string
): void => {
  if (error) {
    throw new Error(`${context}: ${error.message ?? 'Unknown Supabase error'}`);
  }
};

const calculateTrend = (todayValue: number, yesterdayValue: number): number => {
  if (yesterdayValue === 0) {
    return todayValue > 0 ? 100 : 0;
  }

  const difference = todayValue - yesterdayValue;
  return Number(((difference / yesterdayValue) * 100).toFixed(1));
};

export const getLiveMetrics = async () => {
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfTodayIso = startOfToday.toISOString();
  const startOfYesterdayIso = startOfYesterday.toISOString();

  const [
    activeUsersRes,
    todayRegistrationsRes,
    yesterdayRegistrationsRes,
    todayRevenueRes,
    yesterdayRevenueRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('account_status', 'active'),

    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfTodayIso),

    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfYesterdayIso)
      .lt('created_at', startOfTodayIso),

    supabase
      .from('payment_requests')
      .select('amount')
      .eq('status', 'approved')
      .gte('updated_at', startOfTodayIso),

    supabase
      .from('payment_requests')
      .select('amount')
      .eq('status', 'approved')
      .gte('updated_at', startOfYesterdayIso)
      .lt('updated_at', startOfTodayIso),
  ]);

  assertNoSupabaseError(activeUsersRes.error, 'getLiveMetrics(activeUsers)');
  assertNoSupabaseError(
    todayRegistrationsRes.error,
    'getLiveMetrics(todayRegistrations)'
  );
  assertNoSupabaseError(
    yesterdayRegistrationsRes.error,
    'getLiveMetrics(yesterdayRegistrations)'
  );
  assertNoSupabaseError(todayRevenueRes.error, 'getLiveMetrics(todayRevenue)');
  assertNoSupabaseError(
    yesterdayRevenueRes.error,
    'getLiveMetrics(yesterdayRevenue)'
  );

  const todayRegistrationsCount = todayRegistrationsRes.count ?? 0;
  const yesterdayRegistrationsCount = yesterdayRegistrationsRes.count ?? 0;

  const todayRevenue =
    todayRevenueRes.data?.reduce((sum, row) => sum + (row.amount ?? 0), 0) ?? 0;

  const yesterdayRevenue =
    yesterdayRevenueRes.data?.reduce((sum, row) => sum + (row.amount ?? 0), 0) ??
    0;

  return {
    activeUsers: activeUsersRes.count ?? 0,
    todayRegistrations: todayRegistrationsCount,
    todayRevenue,
    usersTrend: 0,
    registrationsTrend: calculateTrend(
      todayRegistrationsCount,
      yesterdayRegistrationsCount
    ),
    revenueTrend: calculateTrend(todayRevenue, yesterdayRevenue),
  };
};

export const getActiveExams = async () => {
  const nowIso = new Date().toISOString();

  const { data: exams, error } = await supabase
    .from('exam_papers')
    .select('id, title')
    .eq('is_published', true)
    .lte('start_time', nowIso)
    .gte('end_time', nowIso)
    .order('start_time', { ascending: false })
    .limit(5);

  assertNoSupabaseError(error, 'getActiveExams(fetchExams)');

  const safeExams: ExamPaperRow[] = exams ?? [];
  if (safeExams.length === 0) return [];

  const results = await Promise.all(
    safeExams.map(async exam => {
      const { count, error: countError } = await supabase
        .from('exam_progress')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', exam.id);

      assertNoSupabaseError(
        countError,
        `getActiveExams(countParticipants:${exam.id})`
      );

      return {
        exam_id: exam.id,
        title: exam.title,
        active_participants: count ?? 0,
      };
    })
  );

  return results;
};

export const getSecurityAlerts = async () => {
  const { data, error } = await supabase
    .from('admin_alerts')
    .select('id, type, message, priority, created_at, is_read, action_link')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(10);

  assertNoSupabaseError(error, 'getSecurityAlerts');

  return (data ?? []) as SecurityAlertRow[];
};

export const getAdminPerformance = async (adminId: string) => {
  const { data, error } = await supabase
    .from('admin_performance_stats')
    .select('month, questions_approved, support_tickets_resolved, users_banned')
    .eq('admin_id', adminId)
    .order('month', { ascending: true })
    .limit(6);

  assertNoSupabaseError(error, 'getAdminPerformance');

  return ((data ?? []) as AdminPerformanceRow[]).map(row => ({
    month: row.month,
    questions_approved: row.questions_approved ?? 0,
    support_tickets_resolved: row.support_tickets_resolved ?? 0,
    users_banned: row.users_banned ?? 0,
  }));
};

export const getPendingPayments = async () => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select(
      `
      id,
      amount,
      method,
      trx_id,
      created_at,
      user_id,
      profiles:user_id(full_name)
    `
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  assertNoSupabaseError(error, 'getPendingPayments');

  return ((data ?? []) as PaymentRequestRow[]).map(payment => ({
    id: payment.id,
    user_id: payment.user_id,
    user_name: payment.profiles?.full_name ?? 'Unknown User',
    amount: payment.amount ?? 0,
    method: payment.method ?? 'Unknown',
    trx_id: payment.trx_id ?? 'N/A',
    created_at: payment.created_at,
  }));
};

export const getModerationQueue = async () => {
  const { data, error } = await supabase
    .from('user_reports')
    .select(
      `
      id,
      type,
      report_reason,
      created_at,
      status,
      profiles:reporter_user_id(full_name)
    `
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  assertNoSupabaseError(error, 'getModerationQueue');

  return ((data ?? []) as UserReportRow[]).map(report => ({
    id: report.id,
    type: report.type,
    report_reason: report.report_reason ?? 'No reason provided',
    reporter_name: report.profiles?.full_name ?? 'Anonymous',
    created_at: report.created_at,
    status: report.status,
  }));
};

// NEW FUNCTION: Get Active Banners for Dashboard Snapshot
export const getActiveBanners = async () => {
  const { data, error } = await supabase
    .from('home_banners')
    .select('id, title, action_link, sequence')
    .eq('is_active', true)
    .order('sequence', { ascending: true })
    .limit(5);

  assertNoSupabaseError(error, 'getActiveBanners');

  return (data ?? []) as ActiveBannerRow[];
};
