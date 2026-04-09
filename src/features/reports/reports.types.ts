export interface CreateReportDTO {
  type: 'question' | 'bug_report' | 'user' | 'message';
  report_reason: string;
  description?: string | null;
  target_question_id?: string | null;
  target_exam_id?: string | null;
  target_message_id?: string | null;
  target_user_id?: string | null;
  screenshot_url?: string | null;
}
