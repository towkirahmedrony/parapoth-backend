export interface ExamHistoryResponse {
  id: string;
  score: number;
  total_marks: number;
  created_at: string;
  details_json?: any;
}

export interface MistakeResponse {
  id: string;
  selected_option: string | null;
  question_id: string;
  questions: any;
}

export interface BookmarkResponse {
  id: string;
  note?: string;
  questions: any;
}
