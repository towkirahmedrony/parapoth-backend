export interface LeaderboardUser {
  id: string;
  username?: string; // username যোগ করা হলো
  full_name: string | null; // name এর বদলে full_name
  avatar_url: string | null;
  institution: string | null;
  total_score: number; // total_xp এর বদলে total_score (ফ্রন্টএন্ডের সাথে মিল রেখে)
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
