import { supabaseAdmin } from '../../config/supabaseAdmin';
import { CreateReportDTO } from './reports.types';

export const createReport = async (userId: string, data: CreateReportDTO) => {
  const { data: report, error } = await supabaseAdmin
    .from('user_reports')
    .insert({
      reporter_user_id: userId,
      type: data.type,
      report_reason: data.report_reason,
      description: data.description || null,
      target_question_id: data.target_question_id || null,
      target_exam_id: data.target_exam_id || null,
      target_message_id: data.target_message_id || null,
      target_user_id: data.target_user_id || null,
      screenshot_url: data.screenshot_url || null,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create report: ${error.message}`);
  }

  return report;
};
