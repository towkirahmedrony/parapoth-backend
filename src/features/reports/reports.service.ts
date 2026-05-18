import { supabaseAdmin } from '../../config/supabaseAdmin';
import { CreateReportDTO } from './reports.types';

export const createReport = async (userId: string, data: CreateReportDTO) => {
  // ১. প্রথমে user_reports টেবিলে রিপোর্ট সেভ করা
  const { data: report, error: reportError } = await supabaseAdmin
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

  if (reportError) {
    throw new Error(`Failed to create report: ${reportError.message}`);
  }

  // ২. যদি target_question_id বা target_exam_id থাকে, তাহলে admin_alerts-এ অ্যালার্ট জেনারেট করা
  if (data.target_question_id || data.target_exam_id) {
    const targetType = data.target_question_id ? 'Question' : 'Exam';
    const targetId = data.target_question_id || data.target_exam_id;
    
    const { error: alertError } = await supabaseAdmin
      .from('admin_alerts')
      .insert({
        title: `Content Issue Reported (${targetType})`,
        message: `A student reported an issue regarding ${targetType} ID: ${targetId}. Reason: ${data.report_reason}`,
        type: 'content_error',
        priority: 'high',
        status: 'pending',
        is_read: false,
        meta_data: {
          report_id: report.id,
          target_question_id: data.target_question_id || null,
          target_exam_id: data.target_exam_id || null
        },
        action_link: `/admin/reports/${report.id}` // ড্যাশবোর্ডে অ্যাকশনের জন্য লিংক
      });

    if (alertError) {
      // অ্যালার্ট তৈরিতে কোনো সমস্যা হলে শুধু লগ করা হচ্ছে, 
      // যাতে স্টুডেন্টের রিপোর্ট সাবমিশনে কোনো বাধা না আসে।
      console.error(`Failed to create admin alert for report ${report.id}:`, alertError.message);
    }
  }

  return report;
};
