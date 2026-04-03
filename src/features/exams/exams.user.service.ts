import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitExamDTO, SubmitHistoryDTO } from './exams.types';

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

  // Arena মুডের জন্য রানডম প্রশ্ন
  static async getArenaQuestions(limit: number) {
    const { data, error } = await supabase
      .from('questions')
      .select('*, media_library!media_id(*), explanation_media:media_library!explanation_media_id(*), comprehension:comprehensions(*, media_library(*))')
      .eq('is_active', true)
      .limit(limit);

    if (error) throw new Error(error.message);
    return data.sort(() => 0.5 - Math.random());
  }

  // ফ্রন্টএন্ড থেকে পাঠানো ডিরেক্ট হিস্ট্রি সেভ (Arena / Model Test এর জন্য)
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

    const { data, error } = await supabase
      .from('exam_history')
      .insert([resultPayload])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // নির্দিষ্ট বোর্ড/মডেল এক্সাম সাবমিট এবং রেজাল্ট ক্যালকুলেশন
  static async submitExamResult(payload: SubmitExamDTO) {
    const { exam_id, user_id, answers, time_taken } = payload;

    const { data: examData, error: examError } = await supabase
      .from('exam_papers')
      .select('default_negative_marks, total_marks')
      .eq('id', exam_id)
      .single();

    if (examError) throw new Error('Exam not found');

    const questionIds = Object.keys(answers);
    const { data: questions } = await supabase
      .from('questions')
      .select('id, options')
      .in('id', questionIds);

    let correct = 0, wrong = 0, skipped = 0, totalScore = 0;

    questions?.forEach((q: any) => {
      const userAnswerId = answers[q.id];
      const optionsArray = (q.options as any[]) || [];
      const correctOption = optionsArray.find((opt: any) => opt.isCorrect);

      if (!userAnswerId) {
        skipped++;
      } else if (correctOption && userAnswerId === correctOption.id) {
        correct++;
        totalScore += 1; 
      } else {
        wrong++;
        totalScore -= (examData.default_negative_marks || 0.25);
      }
    });

    const resultPayload = {
      exam_id,
      user_id,
      score: Math.max(0, totalScore),
      total_marks: examData.total_marks || questions?.length || 0,
      correct_count: correct,
      wrong_count: wrong,
      skipped_count: skipped,
      time_taken,
      details_json: { userAnswers: answers }
    };

    const { data: result, error: submitError } = await supabase
      .from('exam_history')
      .insert([resultPayload])
      .select()
      .single();

    if (submitError) throw new Error(submitError.message);
    return result;
  }

  // নতুন যোগ করা হলো: Group Battle এক্সাম তৈরি করার ফাংশন
  static async createGroupBattleExam(challengerId: string, opponentId: string, examData: any) {
    // ১. নিজেকে নিজে চ্যালেঞ্জ দেওয়া চেক
    if (challengerId === opponentId) {
      throw new Error('আপনি নিজেকে নিজে চ্যালেঞ্জ দিতে পারবেন চিহ্নিত করা যাচ্ছে না!');
    }

    // ২. Service Role Key ব্যবহার করে RLS বাইপাস করে ইনসার্ট
    const { data, error } = await supabase
      .from('exam_papers')
      .insert({
        id: examData.id,
        title: examData.title,
        subject_id: examData.subject_id,
        category: 'group_battle',
        is_premium: false,
        total_marks: examData.total_marks || 50,
        pass_mark: examData.pass_mark || 0,
        duration_min: examData.duration_min || 15,
        is_published: true,
        start_time: examData.start_time,
        end_time: examData.end_time
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
