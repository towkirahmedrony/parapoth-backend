import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitExamDTO, SubmitHistoryDTO } from './exams.types';

const calculateExamXP = async (correctCount: number, totalQuestions: number): Promise<number> => {
  const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
  const rules = (data?.value as any) || {};

  let xp = 20;
  const perCorrect = rules.per_correct_answer || 5;
  xp += (correctCount * perCorrect);
  
  if (totalQuestions > 0) {
    const accuracy = correctCount / totalQuestions;
    if (accuracy === 1) xp += 100;
    else if (accuracy >= 0.8) xp += 30;
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
    return questions;
  }

  static async getArenaQuestions(limit: number, subjectSlug?: string) {
    // 👈 subjectSlug ফিল্টারিং যোগ করা হলো
    let query = supabase
      .from('questions')
      .select('*, subjects!inner(*), media_library!media_id(*), explanation_media:media_library!explanation_media_id(*), comprehension:comprehensions(*, media_library(*))')
      .eq('is_active', true)
      .limit(limit);

    if (subjectSlug) {
      query = query.eq('subjects.slug', subjectSlug);
    }

    const { data: questions, error } = await query;
    if (error) throw new Error(error.message);
    return questions;
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
      ip_address: payload.ip_address || null,
      user_agent: payload.user_agent || null,
      device_id: payload.device_id || null,
      submitted_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('exam_history').insert([resultPayload]).select().single();
    if (error) throw new Error(error.message);

    if (data && payload.details_json && Array.isArray(payload.details_json.detailedResults)) {
       const detailsToInsert = payload.details_json.detailedResults.map((d: any) => ({
          exam_history_id: data.id,
          question_id: d.question_id,
          selected_option: typeof d.selected_option === 'object' ? JSON.stringify(d.selected_option) : d.selected_option || null,
          is_correct: d.is_correct || false,
          marks_awarded: d.marks_awarded || 0
       }));

       const wrongAnswersToInsert = payload.details_json.detailedResults
         .filter((d: any) => !d.is_correct && d.selected_option) 
         .map((d: any) => ({
            user_id: userId,
            exam_id: payload.exam_id || null,
            question_id: d.question_id,
            selected_option: typeof d.selected_option === 'object' ? JSON.stringify(d.selected_option) : d.selected_option
         }));

       const promises = [];
       if (detailsToInsert.length > 0) promises.push(supabase.from('exam_history_details').insert(detailsToInsert));
       if (wrongAnswersToInsert.length > 0) promises.push(supabase.from('wrong_answers').insert(wrongAnswersToInsert));

       const results = await Promise.all(promises);
       results.forEach(res => {
         if (res.error) console.error("❌ Database Insert Error:", res.error);
       });
    }

    const totalQuestions = payload.correct_count + payload.wrong_count + payload.skipped_count;
    const earnedXP = await calculateExamXP(payload.correct_count, totalQuestions);

    await supabase.rpc('update_user_progress', { p_user_id: userId, p_coins: 0, p_xp: earnedXP });
    return data;
  }

  static async submitExamResult(userId: string, payload: SubmitExamDTO) {
    const { exam_id, answers, time_taken, ip_address, user_agent, device_id } = payload;
    
    // 👈 ডাটাবেস لیভেলে ডুপ্লিকেট চেকের পাশাপাশি কোড লেভেলেও প্রিভেন্টিভ চেক
    const { data: existing } = await supabase
      .from('exam_history')
      .select('id')
      .eq('user_id', userId)
      .eq('exam_id', exam_id)
      .maybeSingle();
      
    if (existing) {
      throw new Error('You have already submitted this exam.');
    }

    const { data: examData, error: examError } = await supabase.from('exam_papers').select('default_negative_marks, total_marks').eq('id', exam_id).single();
    if (examError) throw new Error('Exam not found');

    const questionIds = Object.keys(answers);
    const { data: questions } = await supabase.from('questions').select('id, options').in('id', questionIds);

    let correct = 0, wrong = 0, skipped = 0, totalScore = 0;
    const detailsToInsert: any[] = []; 
    const wrongAnswersToInsert: any[] = []; 

    questions?.forEach((q: any) => {
      const userAnswerId = answers[q.id];
      const optionsArray = (q.options as any[]) || [];
      const correctOption = optionsArray.find((opt: any) => opt.isCorrect);

      let isCorrect = false;
      let marksAwarded = 0;

      if (!userAnswerId) {
        skipped++;
      } else if (correctOption && userAnswerId === correctOption.id) { 
        correct++; totalScore += 1; isCorrect = true; marksAwarded = 1;
      } else { 
        wrong++; totalScore -= (examData.default_negative_marks || 0.25); isCorrect = false; marksAwarded = -(examData.default_negative_marks || 0.25);
        wrongAnswersToInsert.push({
           user_id: userId, exam_id: exam_id, question_id: q.id,
           selected_option: typeof userAnswerId === 'object' ? JSON.stringify(userAnswerId) : userAnswerId
        });
      }

      detailsToInsert.push({
        question_id: q.id,
        selected_option: typeof userAnswerId === 'object' ? JSON.stringify(userAnswerId) : userAnswerId || null,
        is_correct: isCorrect, marks_awarded: marksAwarded
      });
    });

    const resultPayload = {
      exam_id, user_id: userId, score: Math.max(0, totalScore),
      total_marks: examData.total_marks || questions?.length || 0,
      correct_count: correct, wrong_count: wrong, skipped_count: skipped,
      time_taken, details_json: { userAnswers: answers },
      ip_address: ip_address || null,
      user_agent: user_agent || null,
      device_id: device_id || null
    };

    const { data: result, error: submitError } = await supabase.from('exam_history').insert([resultPayload]).select().single();
    if (submitError) throw new Error(submitError.message);

    const promises = [];
    if (result && detailsToInsert.length > 0) {
      const finalDetails = detailsToInsert.map(d => ({ ...d, exam_history_id: result.id }));
      promises.push(supabase.from('exam_history_details').insert(finalDetails));
    }
    if (wrongAnswersToInsert.length > 0) {
      promises.push(supabase.from('wrong_answers').insert(wrongAnswersToInsert));
    }

    const insertResults = await Promise.all(promises);
    insertResults.forEach(res => {
        if (res.error) console.error("❌ Database Insert Error:", res.error);
    });

    const totalQuestions = questions?.length || 0;
    const earnedXP = await calculateExamXP(correct, totalQuestions);
    await supabase.rpc('update_user_progress', { p_user_id: userId, p_coins: 0, p_xp: earnedXP });

    return result;
  }

  static async createGroupBattleExam(challengerId: string, opponentId: string, examData: any) {
    if (challengerId === opponentId) throw new Error('আপনি নিজেকে নিজে চ্যালেঞ্জ দিতে পারবেন না!');
    const { data, error } = await supabase.from('exam_papers').insert({
      id: examData.id, title: examData.title, subject_id: examData.subject_id, category: 'group_battle',
      is_premium: false, total_marks: examData.total_marks || 50, pass_mark: examData.pass_mark || 0,
      duration_min: examData.duration_min || 15, is_published: true, start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).select().single();
    if (error) throw new Error(error.message);
    
    const { error: battleError } = await supabase.from('group_battles').insert({
       exam_id: data.id, initiated_by: challengerId, status: 'pending',
       scores_snapshot: { [challengerId]: 0, [opponentId]: 0 }
    });
    if (battleError) throw new Error(battleError.message);
    
    return data;
  }

  static async toggleBookmark(userId: string, questionId: string) {
    const { data: existing, error: fetchError } = await supabase.from('bookmarks').select('id').eq('user_id', userId).eq('question_id', questionId).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);

    if (existing) {
      const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id);
      if (error) throw new Error(error.message);
      return { message: 'বুকমার্ক রিমুভ করা হয়েছে', isBookmarked: false };
    } else {
      const { error } = await supabase.from('bookmarks').insert([{ user_id: userId, question_id: questionId }]);
      if (error) throw new Error(error.message);
      return { message: 'বুকমার্ক যুক্ত করা হয়েছে', isBookmarked: true };
    }
  }
}
