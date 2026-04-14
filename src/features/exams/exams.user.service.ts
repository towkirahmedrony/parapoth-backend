import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitExamDTO, SubmitHistoryDTO } from './exams.types';

// Helper function for dynamic XP calculation
const calculateExamXP = async (correctCount: number, totalQuestions: number): Promise<number> => {
  const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
  const rules = (data?.value as any) || {};

  let xp = 20; // বেস পয়েন্ট
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

  static async getArenaQuestions(limit: number, subjectSlug?: string) {
    let subjectId = null;

    if (subjectSlug) {
      const { data: subjectData } = await supabase
        .from('subjects')
        .select('id')
        .eq('slug', subjectSlug)
        .single();
      
      if (subjectData) {
        subjectId = subjectData.id;
      }
    }

    let query = supabase
      .from('questions')
      .select('*, media_library!media_id(*), explanation_media:media_library!explanation_media_id(*), comprehension:comprehensions(*, media_library(*))')
      .eq('is_active', true);

    if (subjectId) {
      query = query.eq('subject_id', subjectId);
    }

    const { data, error } = await query.limit(limit);
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

    // 🌟 আপডেট: exam_history_details এবং wrong_answers এ ডাটা সেভ করার লজিক
    if (data && payload.details_json && Array.isArray(payload.details_json.detailedResults)) {
       const detailsToInsert: any[] = [];
       const wrongAnswersToInsert: any[] = [];

       payload.details_json.detailedResults.forEach((d: any) => {
          // ১. exam_history_details এর জন্য ডেটা প্রস্তুত করা
          detailsToInsert.push({
             exam_history_id: data.id,
             question_id: d.question_id,
             selected_option: d.selected_option || null,
             is_correct: d.is_correct || false,
             marks_awarded: d.marks_awarded || 0
          });

          // ২. wrong_answers এর জন্য ডেটা প্রস্তুত করা (যদি উত্তর ভুল হয়)
          if (d.is_correct === false && d.selected_option) { // স্কিপ করা প্রশ্ন বাদ দিতে && d.selected_option চেক করা হলো
             wrongAnswersToInsert.push({
                user_id: userId,
                exam_id: payload.exam_id || null,
                question_id: d.question_id,
                selected_option: d.selected_option,
             });
          }
       });

       if (detailsToInsert.length > 0) {
          const { error: detailsError } = await supabase.from('exam_history_details').insert(detailsToInsert);
          if (detailsError) console.error("❌ Failed to insert details:", detailsError);
          else console.log(`✅ Successfully saved ${detailsToInsert.length} rows to exam_history_details!`);
       }

       if (wrongAnswersToInsert.length > 0) {
          const { error: wrongAnsError } = await supabase.from('wrong_answers').insert(wrongAnswersToInsert);
          if (wrongAnsError) console.error("❌ Failed to insert wrong answers:", wrongAnsError);
          else console.log(`✅ Successfully saved ${wrongAnswersToInsert.length} rows to wrong_answers!`);
       }
    } else {
       console.log("⚠️ No detailedResults found in payload from frontend.");
    }

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
        correct++; 
        totalScore += 1; 
        isCorrect = true;
        marksAwarded = 1;
      } else { 
        wrong++; 
        totalScore -= (examData.default_negative_marks || 0.25); 
        isCorrect = false;
        marksAwarded = -(examData.default_negative_marks || 0.25);

        // ভুল উত্তরের জন্য wrong_answers এ ডাটা পুশ করা
        wrongAnswersToInsert.push({
           user_id: user_id,
           exam_id: exam_id,
           question_id: q.id,
           selected_option: userAnswerId
        });
      }

      detailsToInsert.push({
        question_id: q.id,
        selected_option: userAnswerId || null,
        is_correct: isCorrect,
        marks_awarded: marksAwarded
      });
    });

    const resultPayload = {
      exam_id, user_id, score: Math.max(0, totalScore),
      total_marks: examData.total_marks || questions?.length || 0,
      correct_count: correct, wrong_count: wrong, skipped_count: skipped,
      time_taken, details_json: { userAnswers: answers }
    };

    const { data: result, error: submitError } = await supabase.from('exam_history').insert([resultPayload]).select().single();
    if (submitError) throw new Error(submitError.message);

    if (result && detailsToInsert.length > 0) {
      const finalDetails = detailsToInsert.map(d => ({ ...d, exam_history_id: result.id }));
      
      const { error: detailsError } = await supabase.from('exam_history_details').insert(finalDetails);
      if (detailsError) console.error("❌ Failed to insert details:", detailsError);
      else console.log(`✅ Successfully saved ${finalDetails.length} rows to exam_history_details!`);
    }

    if (wrongAnswersToInsert.length > 0) {
       const { error: wrongAnsError } = await supabase.from('wrong_answers').insert(wrongAnswersToInsert);
       if (wrongAnsError) console.error("❌ Failed to insert wrong answers:", wrongAnsError);
       else console.log(`✅ Successfully saved ${wrongAnswersToInsert.length} rows to wrong_answers!`);
    }

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
