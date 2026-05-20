import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitExamDTO, SubmitHistoryDTO } from './exams.types';

// Helper function for dynamic XP calculation (Only accessible by authenticated backends)
const calculateExamXP = async (correctCount: number, totalQuestions: number): Promise<number> => {
  const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
  const rules = (data?.value as any) || {};

  let xp = 20; 
  const perCorrect = rules.per_correct_answer || 5;
  xp += (correctCount * perCorrect);
  
  if (totalQuestions > 0) {
    const accuracy = correctCount / totalQuestions;
    if (accuracy === 1) {
      xp += 100; 
    } else if (accuracy >= 0.8) {
      xp += 30; 
    }
  }
  return xp;
};

// 🛡️ Whitelist Sanitize Process (Sensitive/Internal Metadata protection)
const sanitizeQuestionsForClient = (questions: any[] = []) => {
  return questions.map((q) => ({
    id: q.id,
    subject_id: q.subject_id,
    chapter_id: q.chapter_id,
    topic_id: q.topic_id,
    comprehension_id: q.comprehension_id,
    type: q.type,
    difficulty_level: q.difficulty_level,
    body: q.body ? {
      text_bn: q.body.text_bn,
      text_en: q.body.text_en,
      image_url: q.body.image_url,
    } : null,
    options: Array.isArray(q.options)
      ? q.options.map((opt: any) => ({
          id: opt.id,
          text_bn: opt.text_bn,
          text_en: opt.text_en,
        }))
      : [],
    media_library: q.media_library ?? null,
    comprehension: q.comprehension ? {
      id: q.comprehension.id,
      title: q.comprehension.title,
      body: q.comprehension.body,
      media_library: q.comprehension.media_library ?? null,
    } : null,
  }));
};

// 🛡️ Whitelist specific public fields only to prevent internal system leaks
const EXAM_QUESTION_SELECT_QUERY = `
  id, 
  subject_id, 
  chapter_id, 
  topic_id, 
  comprehension_id, 
  type, 
  difficulty_level, 
  body, 
  options, 
  media_library!media_id(id, file_url, file_type, file_name), 
  comprehension:comprehensions(
    id, 
    title, 
    body, 
    media_library(id, file_url, file_type, file_name)
  )
`;

export class ExamUserService {
  static async generateExam(payload: GenerateExamDTO) {
    const { topics, limit } = payload;
    
    // 🎯 র্যান্ডমাইজেশন ফিক্স: প্রথমে সমস্ত ভ্যালিড প্রশ্নের শুধুমাত্র ID পুল নিয়ে আসা হলো
    const { data: idPool, error: poolError } = await supabase
      .from('questions')
      .select('id')
      .in('topic_id', topics)
      .eq('is_active', true)
      .is('deleted_at', null)
      .eq('status', 'published');
      
    if (poolError) throw new Error(`Database Pool Error: ${poolError.message}`);
    if (!idPool || idPool.length === 0) return [];

    // ট্রু মেমোরি শাফেল করে র্যান্ডম লিমিটেড আইডি সিলেকশন
    const selectedIds = idPool
      .map(q => q.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, limit);

    // নির্বাচিত ইউনিক আইডিগুলোর সম্পূর্ণ সুরক্ষিত ডিটেইলস নিয়ে আসা
    const { data: questions, error: fetchError } = await supabase
      .from('questions')
      .select(EXAM_QUESTION_SELECT_QUERY)
      .in('id', selectedIds)
      .eq('is_active', true);
      
    if (fetchError) throw new Error(`Question Fetch Error: ${fetchError.message}`);
    
    const safeQuestions = sanitizeQuestionsForClient(questions);
    return safeQuestions.sort(() => 0.5 - Math.random());
  }

  static async getArenaQuestions(userId: string, limit: number, subjectSlug?: string) {
    let subjectId = null;

    if (subjectSlug) {
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select('id')
        .eq('slug', subjectSlug)
        .single();
      
      if (subjectError && subjectError.code !== 'PGRST116') throw new Error(subjectError.message);
      if (subjectData) {
        subjectId = subjectData.id;
      }
    }

    const { data, error } = await supabase.rpc('get_mixed_adaptive_questions', {
      p_user_id: userId,
      p_limit: limit,
      p_subject_id: subjectId ?? null,
    });

    if (error) throw new Error(`Adaptive Engine Error: ${error.message}`);
    return data;
  }

  static async submitHistory(userId: string, payload: SubmitHistoryDTO) {
    // 🛡️ সিকিউরিটি ফিক্স: প্র্যাকটিস বা থার্ড পার্টি হিস্ট্রির বডি থেকে আসা স্কোর কেবল লগ হিসেবে সেভ হবে। 
    // এখান থেকে কোনো কয়েন বা এক্সপি দেওয়া হবে না জালিয়াতি ঠেকাতে।
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
      submitted_at: new Date().toISOString(),
      status: 'completed'
    };

    const { data, error } = await supabase.from('exam_history').insert([resultPayload]).select('id').single();
    if (error) throw new Error(`History Logging Failed: ${error.message}`);

    return data;
  }

  static async submitExamResult(payload: SubmitExamDTO) {
    const { exam_id, user_id, answers, time_taken } = payload;
    
    // ১. এক্সাম পেপার ডাটা এবং নেগেটিভ মার্কিং রুলস নিয়ে আসা
    const { data: examData, error: examError } = await supabase
      .from('exam_papers')
      .select('default_negative_marks, total_marks')
      .eq('id', exam_id)
      .single();
      
    if (examError || !examData) throw new Error('Exam validation failed: Paper not found');

    const submittedQuestionIds = Object.keys(answers);
    if (submittedQuestionIds.length === 0) throw new Error('No answers provided');

    // 🛡️ ২. প্রশ্ন জালিয়াতি প্রতিরোধ লজিক (Cross-Verification Matrix)
    // চেক করা হচ্ছে স্টুডেন্ট অন্য কোনো সহজ প্রশ্নের আইডি সাবমিট করে দিচ্ছে কিনা
    const { data: validPaperQuestions, error: verificationError } = await supabase
      .from('exam_paper_questions')
      .select('question_id')
      .eq('exam_id', exam_id);

    if (verificationError) throw new Error(`Verification Engine Error: ${verificationError.message}`);
    
    const validQuestionSet = new Set(validPaperQuestions?.map(pq => pq.question_id) || []);
    const isAuthenticSubmission = submittedQuestionIds.every(id => validQuestionSet.has(id));
    
    if (!isAuthenticSubmission) {
      throw new Error('Security Breach: Submitted question IDs do not match this specific Exam Paper!');
    }

    // ৩. ডাটাবেস থেকে রিয়েল কারেক্ট অপশনগুলো ম্যাচ করানোর জন্য ডাটা আনা
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, options')
      .in('id', submittedQuestionIds);

    if (questionsError) throw new Error(`Question Integrity Error: ${questionsError.message}`);

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    let totalScore = 0;
    
    questions?.forEach((q: any) => {
      const userAnswerId = answers[q.id];
      const optionsArray = Array.isArray(q.options) ? q.options : [];
      const correctOption = optionsArray.find((opt: any) => opt.isCorrect === true);

      // স্কিপড প্রশ্ন হ্যান্ডলিং
      if (userAnswerId === undefined || userAnswerId === null || userAnswerId === '') {
        skipped++;
        return;
      }

      // 🛡️ টাইপ মিসম্যাচ ফিক্স: স্ট্রিং বা নাম্বার যাই আসুক, সুরক্ষিত উপায়ে কাস্ট করে চেক করা হচ্ছে
      if (correctOption && Number(userAnswerId) === Number(correctOption.id)) { 
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
      score: Math.max(0, totalScore), // স্কোর নেগেটিভে নামলেও ০ এর নিচে যাবে না
      total_marks: examData.total_marks || questions?.length || 0,
      correct_count: correct, 
      wrong_count: wrong, 
      skipped_count: skipped,
      time_taken, 
      details_json: { userAnswers: answers },
      submitted_at: new Date().toISOString()
    };

    const { data: result, error: submitError } = await supabase.from('exam_history').insert([resultPayload]).select().single();
    if (submitError) throw new Error(`Final Submission Failed: ${submitError.message}`);

    // ৪. ব্যাকএন্ড ভেরিফাইড স্কোরের ওপর ভিত্তি করে শুধুমাত্র এই একটি এন্ডপয়েন্ট থেকেই XP রিওয়ার্ড ট্রিগার হবে
    const totalQuestions = questions?.length || 0;
    const earnedXP = await calculateExamXP(correct, totalQuestions);
    await supabase.rpc('update_user_progress', { p_user_id: user_id, p_coins: 0, p_xp: earnedXP });

    return result;
  }

  static async createGroupBattleExam(challengerId: string, opponentId: string, examData: any) {
    if (challengerId === opponentId) throw new Error('Security Error: You cannot challenge yourself!');
    
    const { data, error } = await supabase.from('exam_papers').insert({
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
    }).select().single();
    
    if (error) throw new Error(`Battle Initialization Failed: ${error.message}`);
    return data;
  }
}
