import { supabase } from '../../config/supabase';
import { AutoFetchDTO, PunishUserDTO } from './exams.types';

export class ExamAdminService {
  static async getAllExams() {
    const { data, error } = await supabase.from('exam_papers').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  static async getExamDetails(id: string) {
    const { data, error } = await supabase.from('exam_papers').select('*').eq('id', id).single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteExam(id: string) {
    const { data, error } = await supabase.from('exam_papers').delete().eq('id', id).select();
    if (error) throw new Error(error.message);
    return data;
  }

  static async togglePublish(id: string) {
    const exam = await ExamAdminService.getExamDetails(id);
    const { data, error } = await supabase
      .from('exam_papers')
      .update({ is_published: !exam.is_published })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async autoFetchQuestions(payload: AutoFetchDTO) {
    let query = supabase.from('questions').select('id, body');
    if (payload.mode === 'custom') {
      query = query.eq('chapter_id', payload.chapter_id);
    } else {
      query = query.contains('exam_references', [{ type: payload.reference_type, year: payload.year }]);
    }
    const limitCount = (payload.easy_count || 0) + (payload.medium_count || 0) + (payload.hard_count || 0);
    if (limitCount > 0) query = query.limit(limitCount);
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  static async punishUser(payload: PunishUserDTO) {
    if (payload.action === 'zero_marks') {
      await supabase.from('exam_history').update({ score: 0, status: 'fraud_detected' }).eq('user_id', payload.userId);
    } else if (payload.action === 'ban_device') {
      await supabase.from('profiles').update({ account_status: 'suspended' }).eq('id', payload.userId);
    }
    return { success: true, action: payload.action };
  }

  static async getLiveProgress(examId: string) {
    const { data, error } = await supabase
      .from('exam_progress')
      .select('id, user_id, current_question_index, time_remaining, last_updated_at, profiles(full_name)')
      .eq('exam_id', examId)
      .order('last_updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    
    return data.map((p: any) => ({
      ...p,
      user_name: p.profiles?.full_name || 'Unknown User'
    }));
  }

  static async getLeaderboard(examId: string) {
    const { data, error } = await supabase
      .from('exam_history')
      .select('id, user_id, score, total_marks, time_taken, device_type, profiles(full_name)')
      .eq('exam_id', examId)
      .order('score', { ascending: false })
      .order('time_taken', { ascending: true });
    if (error) throw new Error(error.message);

    return data.map((entry: any) => ({
      ...entry,
      user_name: entry.profiles?.full_name || 'Unknown User'
    }));
  }

  static async recoverSession(progressId: string) {
    const { data, error } = await supabase
      .from('exam_progress')
      .update({ last_updated_at: new Date().toISOString() })
      .eq('id', progressId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
