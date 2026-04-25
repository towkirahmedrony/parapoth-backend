export interface GenerateExamDTO {
  topics: string[];
  limit: number;
}

export interface SubmitExamDTO {
  exam_id: string;
  answers: Record<string, string>;
  time_taken: number;
  ip_address?: string;
  user_agent?: string | null;
  device_id?: string | null;
}

export interface SubmitHistoryDTO {
  exam_id?: string;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  time_taken: number;
  score: number;
  total_marks: number;
  details_json: any;
  ip_address?: string;
  user_agent?: string | null;
  device_id?: string | null;
}

export interface AutoFetchDTO {
  mode: 'custom' | 'board';
  chapter_id?: string;
  easy_count?: number;
  medium_count?: number;
  hard_count?: number;
  reference_type?: string;
  year?: string;
}

export interface PunishUserDTO {
  userId: string;
  action: 'zero_marks' | 'ban_device';
}

export interface ToggleBookmarkDTO {
  questionId: string;
}
