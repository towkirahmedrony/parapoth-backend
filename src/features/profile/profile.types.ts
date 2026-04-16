export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  institution?: string;
  class_level?: string;
  group?: string;
  education_board?: string;
  batch_year?: string;
  gender?: string;
  study_goal?: string;
  address?: any;
  date_of_birth?: string;      // নতুন যুক্ত করা হলো
  guardian_phone?: string;     // নতুন যুক্ত করা হলো
  total_xp: number;
  pvp_rating: number;
  current_streak: number;
  max_streak: number;
  is_pro: boolean;
  created_at: string;
}

export interface UpdateProfileDto {
  username?: string;           // নতুন যুক্ত করা হলো
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  institution?: string;
  class_level?: string;
  group?: string;
  education_board?: string;
  batch_year?: string;
  gender?: string;
  study_goal?: string;
  address?: any;
  date_of_birth?: string;      // নতুন যুক্ত করা হলো
  guardian_phone?: string;     // নতুন যুক্ত করা হলো
}

export interface ActivityPoint {
  day: string;
  exams: number;
  xp: number;
}
