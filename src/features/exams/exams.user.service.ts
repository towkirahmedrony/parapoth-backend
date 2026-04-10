import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitExamDTO, SubmitHistoryDTO } from './exams.types';

// Helper function for dynamic XP calculation
const calculateExamXP = async (correctCount: number, totalQuestions: number): Promise<number> => {
  const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
  const rules = (data?.value as any) || {};

  let xp = 20; // বেস পয়েন্ট (আপনি চাইলে এটিও রুলসে যোগ করতে পারেন)
  const perCorrect = rules.per_correct_answer || 5;
  xp += (correctCount * perCorrect);
  
  if (totalQuestions > 0) {
    const accuracy = correctCount / totalQuestions;
    if (accuracy === 1) {
      xp += 100; // ১০০% সঠিক উত্তর বোনাস
    } else if (accuracy >= 0.8) {
      xp += 30; // ৮০% এর বেশি সঠিক উত্তর বোনাস
    }
  }
  return xp;
};

export class ExamUserService {
  static async generateExam(payload: GenerateExamDTO) {
    const { topics, limit } = payload;
    const { data: questions, error } = await supabase
      .from('questions')
      .select('*, media_library!media_id(*), explanation_media:media_library!explanation_media_id(*), comprehension:comprehensions(*, media_library(*))') 
      .in('topic_id', topics)
      .eq('is_active', true)
      .limit(limit);
    if (error) throw new Error(error.message);
    return questions.sort(() => 0.5 - Math.random());
  }

  static async getArenaQuestions(limit: number) {
    const { data, error } = await supabase
      .from('questions')
      .select('*, media_library!media_id(*), explanation_media:media_library!explanation_media_id(*), comprehension:comprehensions(*, media_library(*))')
      .eq('is_active', true)
      .limit(limit);
    if (error) throw new Error(error.message);
    return data.sort(() => 0.5 - Math.random());
  }

  static async submitHistory(userId: string, payload: SubmitHistoryDTO) {
    const resultPayload = {
      user_id: userId,
      exam_id: payload.exam_id || null,
      score: payload.score,
      total_marks: payload.total_marks,
      correct_count: payload.correct_count,
      wrong_count: payload.wrong_count,
      skipped_count: payload.skipped_count,
      time_taken: payload.time_taken,
      details_json: payload.details_json,
      submitted_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('exam_history').insert([resultPayload]).select().single();
    if (error) throw new Error(error.message);

    const totalQuestions = payload.correct_count + payload.wrong_count + payload.skipped_count;
    const earnedXP = await calculateExamXP(payload.correct_count, totalQuestions);

    await supabase.rpc('update_user_progress', { p_user_id: userId, p_coins: 0, p_xp: earnedXP });
    return data;
  }

  static async submitExamResult(payload: SubmitExamDTO) {
    const { exam_id, user_id, answers, time_taken } = payload;
    const { data: examData, error: examError } = await supabase.from('exam_papers').select('default_negative_marks, total_marks').eq('id', exam_id).single();
    if (examError) throw new Error('Exam not found');

    const questionIds = Object.keys(answers);
    const { data: questions } = await supabase.from('questions').select('id, options').in('id', questionIds);

    let correct = 0, wrong = 0, skipped = 0, totalScore = 0;
    questions?.forEach((q: any) => {
      const userAnswerId = answers[q.id];
      const optionsArray = (q.options as any[]) || [];
      const correctOption = optionsArray.find((opt: any) => opt.isCorrect);

      if (!userAnswerId) skipped++;
      else if (correctOption && userAnswerId === correctOption.id) { correct++; totalScore += 1; }
      else { wrong++; totalScore -= (examData.default_negative_marks || 0.25); }
    });

    const resultPayload = {
      exam_id, user_id, score: Math.max(0, totalScore),
      total_marks: examData.total_marks || questions?.length || 0,
      correct_count: correct, wrong_count: wrong, skipped_count: skipped,
      time_taken, details_json: { userAnswers: answers }
    };

    const { data: result, error: submitError } = await supabase.from('exam_history').insert([resultPayload]).select().single();
    if (submitError) throw new Error(submitError.message);

    const totalQuestions = questions?.length || 0;
    const earnedXP = await calculateExamXP(correct, totalQuestions);
    await supabase.rpc('update_user_progress', { p_user_id: user_id, p_coins: 0, p_xp: earnedXP });

    return result;
  }

  static async createGroupBattleExam(challengerId: string, opponentId: string, examData: any) {
    if (challengerId === opponentId) throw new Error('আপনি নিজেকে নিজে চ্যালেঞ্জ দিতে পারবেন চিহ্নিত করা যাচ্ছে না!');
    const { data, error } = await supabase.from('exam_papers').insert({
      id: examData.id, title: examData.title, subject_id: examData.subject_id, category: 'group_battle',
      is_premium: false, total_marks: examData.total_marks || 50, pass_mark: examData.pass_mark || 0,
      duration_min: examData.duration_min || 15, is_published: true, start_time: examData.start_time, end_time: examData.end_time
    }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
}
