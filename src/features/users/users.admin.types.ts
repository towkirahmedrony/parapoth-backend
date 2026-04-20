import type { Database } from '../../types/database.type';

export type UserProfile = Database['public']['Tables']['profiles']['Row'];
export type Device = Database['public']['Tables']['user_devices']['Row'];
export type CoinTransaction = Database['public']['Tables']['coin_transactions']['Row'];
export type PaymentRequest = Database['public']['Tables']['payment_requests']['Row'];
export type UserWarning = Database['public']['Tables']['user_warnings']['Row'];
export type SupportTicket = Database['public']['Tables']['user_reports']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

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
  payment_requests: PaymentRequest[];
  quests: any[];
  devices: Device[];
  support_tickets: SupportTicket[];
  audit_logs: AuditLog[];
  warnings: UserWarning[];
  focus_sessions_joined?: number;
  focus_sessions_started?: number;
  total_focus_minutes?: number;
  longest_streak?: number;
}
