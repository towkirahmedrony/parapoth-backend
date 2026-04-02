export interface CreatePlanDTO {
  name: string;
  price: number;
  discounted_price?: number;
  duration_days: number;
  features?: string[];
  target_batches?: string[];
  is_active?: boolean;
}

export interface CreateCouponDTO {
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  max_usage?: number;
  expires_at?: string;
}

export interface CreateAchievementDTO {
  title: string;
  condition_type: string;
  condition_value: any;
  xp_reward: number;
}

export interface CreateQuestDTO {
  title: string;
  action_type: string;
  target_count: number;
  xp_reward?: number;
  coin_reward?: number;
  reset_frequency?: 'daily' | 'weekly';
}

export interface ManualOverrideDTO {
  user_identifier: string; // email or phone
  plan_id: string;
}
