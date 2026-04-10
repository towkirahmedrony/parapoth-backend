export interface LeaderboardUser {
  id: string;
  username?: string;
  full_name: string | null;
  avatar_url: string | null;
  institution: string | null;
  total_score: number;
  current_streak: number;
  rank: number;
  is_current_user?: boolean;
}

export interface SquadRank {
  id: string;
  name: string;
  icon: string;
  group_level: number;
  total_xp: number;
  rank: number;
}

export interface GroupLeaderboardResponse {
  hasGroup: boolean;
  myGroup: SquadRank | null;
  topGroups: SquadRank[];
}
