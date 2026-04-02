import { supabase } from '../../config/supabase';
import { 
  CreatePlanDTO, CreateCouponDTO, CreateAchievementDTO, 
  CreateQuestDTO, ManualOverrideDTO 
} from './monetization.types';

// ================= Plans =================
export const getPlans = async () => {
  const { data, error } = await supabase.from('subscription_plans').select('*').order('price', { ascending: true });
  if (error) throw error;
  return data;
};

export const createPlan = async (payload: CreatePlanDTO) => {
  const { data, error } = await supabase.from('subscription_plans').insert(payload).select().single();
  if (error) throw error;
  return data;
};

export const deletePlan = async (id: string) => {
  const { error } = await supabase.from('subscription_plans').delete().eq('id', id);
  if (error) throw error;
  return true;
};

// ================= Coupons =================
export const getCoupons = async () => {
  const { data, error } = await supabase.from('coupons').select('*').order('expires_at', { ascending: true });
  if (error) throw error;
  return data;
};

export const createCoupon = async (payload: CreateCouponDTO) => {
  const { data, error } = await supabase.from('coupons').insert(payload).select().single();
  if (error) throw error;
  return data;
};

export const deleteCoupon = async (code: string) => {
  const { error } = await supabase.from('coupons').delete().eq('code', code);
  if (error) throw error;
  return true;
};

// ================= Gamification =================
export const getAchievements = async () => {
  const { data, error } = await supabase.from('achievements_master').select('*');
  if (error) throw error;
  return data;
};

export const createAchievement = async (payload: CreateAchievementDTO) => {
  const { data, error } = await supabase.from('achievements_master').insert(payload).select().single();
  if (error) throw error;
  return data;
};

export const getQuests = async () => {
  const { data, error } = await supabase.from('daily_quests').select('*');
  if (error) throw error;
  return data;
};

export const createQuest = async (payload: CreateQuestDTO) => {
  const { data, error } = await supabase.from('daily_quests').insert(payload).select().single();
  if (error) throw error;
  return data;
};

// ================= Manual Override =================
export const grantManualSubscription = async (payload: ManualOverrideDTO) => {
  // Find user by email or phone
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .or(`email.eq.${payload.user_identifier},phone_number.eq.${payload.user_identifier}`)
    .single();

  if (userError || !user) throw new Error('User not found');

  // Fetch plan duration
  const { data: plan, error: planError } = await supabase
    .from('subscription_plans')
    .select('duration_days')
    .eq('id', payload.plan_id)
    .single();

  if (planError || !plan) throw new Error('Plan not found');

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.duration_days);

  // Insert into user_subscriptions
  const { data, error } = await supabase.from('user_subscriptions').insert({
    user_id: user.id,
    plan_id: payload.plan_id,
    start_date: new Date().toISOString(),
    end_date: endDate.toISOString(),
    status: 'active',
    auto_renewal: false
  }).select().single();

  if (error) throw error;
  
  // Update profile status
  await supabase.from('profiles').update({ subscription_status: 'premium' }).eq('id', user.id);

  return data;
};
