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
  total_xp: number;
  pvp_rating: number;
  current_streak: number;
  max_streak: number;
  is_pro: boolean;
  created_at: string;
}

export interface UpdateProfileDto {
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  institution?: string;
  class_level?: string;
  group?: string;
  education_board?: string;
  batch_year?: string;
}

export interface ActivityPoint {
  day: string;
  exams: number;
  xp: number;
}
