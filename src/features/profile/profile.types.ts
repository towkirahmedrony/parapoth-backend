export interface PlayerStats {
  total_xp: number;
  accuracy: number;
  current_streak: number;
  total_exams: number;
}

export interface Badge {
  id: string;
  title: string;
  icon_url: string | null;
  is_earned: boolean;
}

export interface PublicProfileResponse {
  profile: {
    id: string;
    username: string | null;
    full_name: string;
    avatar_url: string;
    bio: string;
    batch_year: string;
    pvp_rating: number;
    total_xp: number;
    badges: Badge[];
  };
  versusStats: {
    my_stats: PlayerStats;
    their_stats: PlayerStats;
  };
  activityData: {
    day: string;
    you: number;
    them: number;
  }[];
}
