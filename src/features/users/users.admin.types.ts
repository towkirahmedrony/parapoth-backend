import type { Database } from '../../types/database.types';

export type UserProfile = Database['public']['Tables']['profiles']['Row'];
export type Device = Database['public']['Tables']['user_devices']['Row'];
export type CoinTransaction = Database['public']['Tables']['coin_transactions']['Row'];
export type PaymentRequest = Database['public']['Tables']['payment_requests']['Row'];

export interface User360Response {
  profile: UserProfile;
  recent_exams: any[];
  exam_stats: any;
  academic_engagement: {
    bookmarks_count: number;
    wrong_answers_count: number;
  };
  group_details: any;
  pvp_stats: {
    played: number;
    won: number;
  };
  subscription_history: any[];
  coin_transactions: CoinTransaction[];
  fiat_payments: PaymentRequest[];
  quests: any[];
  devices: Device[];
  support_tickets: any[];
  audit_logs: any[];
}
