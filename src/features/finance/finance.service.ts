import { supabase } from '../../config/supabase';

// ==========================================
// 📱 USER APP SERVICES
// ==========================================

export const getActivePlans = async () => {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  return data;
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
    .single();

  if (reqError) throw reqError;

  // 2. Update Request Status
  const { data: updatedRequest, error: updateError } = await supabase
    .from('payment_requests')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();

  if (updateError) throw updateError;

  // 3. Link SMS Log to this request
  await supabase
    .from('payment_sms_logs')
    .update({ linked_request_id: requestId, status: 'claimed' })
    .eq('extracted_trx_id', request.trx_id);

  // 4. Assign Plan to User (Assuming you have a 'user_subscriptions' table)
  // Need to calculate end_date properly based on plan duration in a real app
  await supabase
    .from('user_subscriptions')
    .insert([{
      user_id: request.user_id,
      plan_id: request.plan_id,
      status: 'active',
      start_date: new Date().toISOString()
    }]);

  return updatedRequest;
};

export const rejectPayment = async (requestId: string, reason?: string) => {
  const { data, error } = await supabase
    .from('payment_requests')
    .update({ 
      status: 'rejected', 
      rejection_reason: reason || 'Transaction mismatch or invalid',
      updated_at: new Date().toISOString() 
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getRevenueAnalytics = async () => {
  const { data, error } = await supabase
    .from('revenue_analytics_cache')
    .select('*')
    .order('day', { ascending: true });

  if (error) throw error;
  return data;
};
