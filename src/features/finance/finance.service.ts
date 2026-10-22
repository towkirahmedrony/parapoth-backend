import { createRequire } from 'module';
import { supabase } from '../../config/supabase';
import { Language, localizeRecords } from '../../lib/utils/language';

const nodeRequire = createRequire(__filename);

/**
 * Payment state error. `success` is never a database status: a completed
 * payment is always stored as `paid`, which is also the only value revenue
 * reporting counts.
 */
export class PaymentError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'VALIDATION_FAILED') {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
    this.code = code;
  }
}

const notifyPaymentSuccess = async (
  userId: string,
  plan: { name?: string | null; nameEn?: string | null; days?: number | null }
) => {
  try {
    // Loaded lazily (this project compiles to CommonJS) so a Firebase
    // misconfiguration can never prevent a payment from being recorded.
    const { sendPaymentSuccessNotification } = nodeRequire('../notifications/notifications.service');
    await sendPaymentSuccessNotification(userId, plan);
  } catch (error) {
    console.error('Payment notification failed:', (error as Error)?.message);
  }
};

// ==========================================
// 📱 USER APP SERVICES
// ==========================================

export const getActivePlans = async (language: Language = 'bn') => {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, name, name_en, features, features_en, duration_days, price, discounted_price, is_active, target_batches')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  return localizeRecords(data, language, ['name', 'features']);
};

export const getPaymentMethods = async () => {
  // You can fetch this from a 'payment_methods' table or return hardcoded data based on your DB schema
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true);

  if (error) throw error;
  return data;
};

export const submitPaymentClaim = async (payload: any) => {
  // Using RPC if exists, or fallback to direct insert as per frontend logic
  const { data, error } = await supabase.rpc('submit_payment_claim', {
    p_user_id: payload.user_id,
    p_plan_id: payload.plan_id,
    p_amount: payload.amount,
    p_method: payload.method,
    p_sender_number: payload.sender_number,
    p_trx_id: payload.trx_id
  });

  if (error) {
    // Fallback direct insert into payment_requests
    const { data: insertData, error: insertError } = await supabase
      .from('payment_requests')
      .insert([{
        user_id: payload.user_id,
        plan_id: payload.plan_id,
        amount: payload.amount,
        method: payload.method,
        sender_number: payload.sender_number,
        trx_id: payload.trx_id,
        coupon_code: payload.coupon_code || null,
        status: 'pending',
        currency: payload.currency || 'BDT'
      }])
      .select()
      .single();
      
    if (insertError) throw insertError;
    return insertData;
  }
  return data;
};


// ==========================================
// 💻 ADMIN PANEL SERVICES
// ==========================================

export const getCoinEconomyStats = async () => {
  const { data: transactions, error } = await supabase
    .from('coin_transactions')
    .select(`*, profiles(email)`)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const flow = [
    { day: 'Mon', inflow: 1200, outflow: 400 },
    { day: 'Tue', inflow: 1500, outflow: 600 },
    { day: 'Wed', inflow: 1100, outflow: 550 },
  ]; 

  const distribution = [
    { name: 'Exams', value: 400 },
    { name: 'Referrals', value: 300 },
    { name: 'Daily Quests', value: 300 },
  ];

  const fraudAlerts = transactions
    .filter(t => t.amount > 5000)
    .map(t => ({
      id: t.id,
      user_email: (t.profiles as any)?.email || 'Unknown',
      amount: t.amount,
      transaction_type: t.transaction_type,
    }));

  return { flow, distribution, fraudAlerts };
};

export const getParsers = async () => {
  const { data, error } = await supabase
    .from('payment_parsers')
    .select('*')
    .order('id', { ascending: true });

  if (error) throw error;
  return data;
};

export const updateParser = async (id: number, payload: any) => {
  const { data, error } = await supabase
    .from('payment_parsers')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getPendingPayments = async () => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select(`
      *,
      profiles(full_name, email, avatar_url)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map((req: any) => ({
    ...req,
    full_name: req.profiles?.full_name,
    user_email: req.profiles?.email,
    avatar_url: req.profiles?.avatar_url,
  }));
};

export const getUnclaimedSmsLogs = async () => {
  const { data, error } = await supabase
    .from('payment_sms_logs')
    .select('*')
    .is('linked_request_id', null)
    .order('received_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const approvePayment = async (requestId: string) => {
  // 1. Fetch Request Details
  const { data: request, error: reqError } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (reqError) throw reqError;
  if (!request) throw new PaymentError('Payment request not found', 404);
  if (request.status === 'paid') {
    // Approving twice must never extend the subscription twice.
    throw new PaymentError('Payment has already been approved', 409, 'PAYMENT_NOT_PENDING');
  }
  if (request.status !== 'pending') {
    throw new PaymentError('Payment is not pending', 409, 'PAYMENT_NOT_PENDING');
  }

  // 2. Fetch Plan Details for duration
  const { data: plan, error: planError } = await supabase
    .from('subscription_plans')
    .select('duration_days, name, name_en')
    .eq('id', request.plan_id)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) throw new PaymentError('Subscription plan not found', 404);

  // 3. Claim the request atomically: the conditional update makes two
  //    concurrent approvals (or a retry after the first one committed) safe.
  const { data: claimed, error: updateError } = await supabase
    .from('payment_requests')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select();

  if (updateError) throw updateError;
  if (!claimed || claimed.length === 0) {
    throw new PaymentError('Payment is no longer pending', 409, 'PAYMENT_NOT_PENDING');
  }

  const updatedRequest = claimed[0];

  // 4. Link SMS Log if TRX ID exists
  if (request.trx_id) {
    await supabase
      .from('payment_sms_logs')
      .update({ linked_request_id: requestId, status: 'claimed' })
      .eq('extracted_trx_id', request.trx_id);
  }

  // 5. Handle User Subscription (Insert or Extend)
  const now = new Date();
  const { data: existingSub } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', request.user_id)
    .eq('status', 'active')
    .gt('end_date', now.toISOString())
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let endDate: Date;

  if (existingSub) {
    // Extend existing
    endDate = new Date(existingSub.end_date);
    endDate.setDate(endDate.getDate() + plan.duration_days);
    
    await supabase
      .from('user_subscriptions')
      .update({ 
        end_date: endDate.toISOString(),
        plan_id: request.plan_id
      })
      .eq('id', existingSub.id);
  } else {
    // Create new
    endDate = new Date(now);
    endDate.setDate(endDate.getDate() + plan.duration_days);

    await supabase
      .from('user_subscriptions')
      .insert([{
        user_id: request.user_id,
        plan_id: request.plan_id,
        status: 'active',
        start_date: now.toISOString(),
        end_date: endDate.toISOString()
      }]);
  }

  // 6. Update Profile Status to premium
  await supabase
    .from('profiles')
    .update({ subscription_status: 'premium' })
    .eq('id', request.user_id);

  // 7. Notify the student in both languages. Sent only after the transition to
  //    `paid` committed, so a rejected or duplicate approval never notifies.
  await notifyPaymentSuccess(String(request.user_id), {
    name: plan.name,
    nameEn: plan.name_en,
    days: plan.duration_days
  });

  return updatedRequest;
};

export const rejectPayment = async (requestId: string, reason?: string) => {
  // Rejecting is only valid while the payment is pending. A paid request must
  // not be flipped to `failed`, which would leave an active subscription with a
  // failed payment row.
  const { data, error } = await supabase
    .from('payment_requests')
    .update({ 
      status: 'failed', 
      rejection_reason: reason || 'Transaction mismatch or invalid',
      updated_at: new Date().toISOString() 
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select();

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new PaymentError('Payment is not pending', 409, 'PAYMENT_NOT_PENDING');
  }
  return data[0];
};

export const getRevenueAnalytics = async () => {
  const { data, error } = await supabase
    .from('revenue_analytics_cache')
    .select('*')
    .order('day', { ascending: true });

  if (error) throw error;
  return data;
};
