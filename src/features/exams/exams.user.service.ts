import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitHistoryDTO } from './exams.types';

type AnyObject = Record<string, any>;

type SubmitExamPayload = {
  exam_id?: string | null;
  session_id?: string | null;
  user_id: string;
  answers?: Record<string, string | number | null | undefined>;
  question_ids?: string[];
  time_taken?: number;
};

const calculateExamXP = async (
  correctCount: number,
  totalQuestions: number
): Promise<number> => {
  const { data } = await supabase
    .from('app_configs')
    .select('value')
    .eq('key', 'xp_rules')
    .maybeSingle();

  const rules = (data?.value as any) || {};

  let xp = 20;
  const perCorrect = Number(rules.per_correct_answer || 5);
  xp += correctCount * perCorrect;

  if (totalQuestions > 0) {
    const accuracy = correctCount / totalQuestions;

    if (accuracy === 1) {
      xp += 100;
    } else if (accuracy >= 0.8) {
      xp += 30;
    }
  }

  return Math.max(0, Math.floor(xp));
};

const normalizeId = (value: unknown): string => String(value ?? '').trim();

const isEmptyAnswer = (value: unknown): boolean => {
  return value === undefined || value === null || String(value).trim() === '';
};

const sanitizeOptions = (options: any): any[] => {
  if (!Array.isArray(options)) return [];

  return options.map((opt: any) => ({
    id: opt.id,
    text_bn: opt.text_bn,
    text_en: opt.text_en,
    image_url: opt.image_url ?? null,
  }));
};

const sanitizeMedia = (media: AnyObject | null | undefined) => {
  if (!media) return null;

  return {
    id: media.id,
    file_name: media.file_name,
    file_type: media.file_type,
    file_url: media.file_url,
  };
};

const sanitizeQuestionForClient = (q: AnyObject) => ({
  id: q.id,
  subject_id: q.subject_id,
  chapter_id: q.chapter_id,
  topic_id: q.topic_id,
  comprehension_id: q.comprehension_id,
  type: q.type,
  difficulty_level: q.difficulty_level,

  body: q.body
    ? {
        text_bn: q.body.text_bn,
        text_en: q.body.text_en,
        image_url: q.body.image_url ?? null,
      }
    : null,

  options: sanitizeOptions(q.options),

  media_id: q.media_id ?? null,
  media_library: sanitizeMedia(q.media_library),

  comprehension: q.comprehension
    ? {
        id: q.comprehension.id,
        body: q.comprehension.body,
        sequence: q.comprehension.sequence ?? null,
        media_id: q.comprehension.media_id ?? null,
        media_library: sanitizeMedia(q.comprehension.media_library),
      }
    : null,

  category: q.category ?? undefined,
});

const sanitizeQuestionsForClient = (questions: AnyObject[] = []) => {
  return questions.map(sanitizeQuestionForClient);
};

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
  media_id,
  media_library!questions_media_id_fkey(
    id,
    file_name,
    file_type,
    file_url
  ),
  comprehension:comprehensions!questions_comprehension_id_fkey(
    id,
    body,
    sequence,
    media_id,
    media_library!comprehensions_media_id_fkey(
      id,
      file_name,
      file_type,
      file_url
    )
  )
`;

const buildQuestionIds = (
  questionIdsFromPayload: unknown,
  answers: Record<string, unknown>
): string[] => {
  const fromPayload = Array.isArray(questionIdsFromPayload)
    ? questionIdsFromPayload.map(normalizeId)
    : [];

  const fromAnswers = Object.keys(answers || {}).map(normalizeId);

  return Array.from(new Set([...fromPayload, ...fromAnswers])).filter(Boolean);
};

export class ExamUserService {
  static async generateExam(userId: string, payload: GenerateExamDTO) {
    if (!userId) throw new Error('Unauthorized');

    const { topics, limit } = payload as any;

    if (!Array.isArray(topics) || topics.length === 0) {
      throw new Error('Topic list is required');
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

    const { data: questions, error } = await supabase
      .from('questions')
      .select(EXAM_QUESTION_SELECT_QUERY)
      .in('topic_id', topics)
      .eq('is_active', true)
      .eq('status', 'published')
      .is('deleted_at', null)
      .limit(safeLimit);

    if (error) throw new Error(error.message);

    return sanitizeQuestionsForClient(questions || []).sort(() => 0.5 - Math.random());
  }

  static async getArenaQuestions(userId: string, limit: number, subjectSlug?: string) {
    if (!userId) throw new Error('Unauthorized');

    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    let subjectId: string | null = null;

    if (subjectSlug) {
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select('id')
        .eq('slug', subjectSlug)
        .maybeSingle();

      if (subjectError) {
        throw new Error(subjectError.message);
      }

      subjectId = subjectData?.id ?? null;
    }

    const { data, error } = await supabase.rpc('get_mixed_adaptive_questions', {
      p_user_id: userId,
      p_limit: safeLimit,
      p_subject_id: subjectId,
    });

    if (error) {
      console.error('Adaptive RPC Error:', error);

      let fallbackQuery = supabase
        .from('questions')
        .select(EXAM_QUESTION_SELECT_QUERY)
        .eq('is_active', true)
        .eq('status', 'published')
        .is('deleted_at', null)
        .limit(safeLimit);

      if (subjectId) {
        fallbackQuery = fallbackQuery.eq('subject_id', subjectId);
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        throw new Error(fallbackError.message);
      }

      return sanitizeQuestionsForClient(fallbackData || []).sort(() => 0.5 - Math.random());
    }

    return sanitizeQuestionsForClient(data || []);
  }

  /**
   * Legacy endpoint.
   * এটা score/XP/streak এর জন্য secure source না।
   */
  static async submitHistory(userId: string, payload: SubmitHistoryDTO) {
    if (!userId) throw new Error('Unauthorized');

    const resultPayload = {
      user_id: userId,
      exam_id: (payload as any).exam_id || null,
      score: Number((payload as any).score || 0),
      total_marks: Number((payload as any).total_marks || 0),
      correct_count: Number((payload as any).correct_count || 0),
      wrong_count: Number((payload as any).wrong_count || 0),
      skipped_count: Number((payload as any).skipped_count || 0),
      time_taken: Number((payload as any).time_taken || 0),
      details_json: (payload as any).details_json || {},
      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('exam_history')
      .insert([resultPayload])
      .select()
      .single();

    if (error) throw new Error(error.message);

    return data;
  }

  static async submitExamResult(payload: SubmitExamPayload) {
    const { exam_id, session_id, user_id, time_taken } = payload;

    if (!user_id) throw new Error('Unauthorized');

    const answers = payload.answers || {};
    const questionIds = buildQuestionIds(payload.question_ids, answers);

    if (questionIds.length === 0) {
      throw new Error('No questions submitted');
    }

    let defaultNegativeMarks = 0.25;
    let examTotalMarks: number | null = null;

    if (exam_id) {
      const { data: examData, error: examError } = await supabase
        .from('exam_papers')
        .select('id, default_negative_marks, total_marks')
        .eq('id', exam_id)
        .maybeSingle();

      if (examError) throw new Error(examError.message);
      if (!examData) throw new Error('Exam not found');

      defaultNegativeMarks = Number(examData.default_negative_marks ?? 0.25);
      examTotalMarks = Number(examData.total_marks ?? 0);
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, options')
      .in('id', questionIds)
      .eq('is_active', true)
      .eq('status', 'published')
      .is('deleted_at', null);

    if (questionsError) throw new Error(questionsError.message);

    const questionMap = new Map<string, any>();
    (questions || []).forEach((q: any) => {
      questionMap.set(normalizeId(q.id), q);
    });

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    let totalScore = 0;

    const details = questionIds.map((questionId) => {
      const q = questionMap.get(questionId);
      const selectedOptionId = answers[questionId];

      if (!q) {
        skipped++;
        return {
          question_id: questionId,
          selected_option: selectedOptionId ? String(selectedOptionId) : null,
          is_correct: null,
          marks_awarded: 0,
          status: 'question_not_found',
        };
      }

      const optionsArray = Array.isArray(q.options) ? q.options : [];
      const correctOption = optionsArray.find((opt: any) => opt.isCorrect === true);

      if (isEmptyAnswer(selectedOptionId)) {
        skipped++;
        return {
          question_id: questionId,
          selected_option: null,
          is_correct: null,
          marks_awarded: 0,
          status: 'skipped',
        };
      }

      const isCorrect =
        correctOption &&
        Number(selectedOptionId) === Number(correctOption.id);

      if (isCorrect) {
        correct++;
        totalScore += 1;
      } else {
        wrong++;
        totalScore -= defaultNegativeMarks;
      }

      return {
        question_id: questionId,
        selected_option: String(selectedOptionId),
        is_correct: Boolean(isCorrect),
        marks_awarded: isCorrect ? 1 : -defaultNegativeMarks,
        status: isCorrect ? 'correct' : 'wrong',
      };
    });

    const totalQuestions = questionIds.length;
    const finalScore = Math.max(0, Number(totalScore.toFixed(2)));

    const resultPayload = {
      exam_id: exam_id || null,
      user_id,
      score: finalScore,
      total_marks: examTotalMarks || totalQuestions,
      correct_count: correct,
      wrong_count: wrong,
      skipped_count: skipped,
      time_taken: Number(time_taken || 0),
      details_json: {
        session_id: session_id || null,
        answers,
        details,
      },
      submitted_at: new Date().toISOString(),
    };

    const { data: result, error: submitError } = await supabase
      .from('exam_history')
      .insert([resultPayload])
      .select()
      .single();

    if (submitError) throw new Error(submitError.message);

    const detailRows = details
      .filter((item) => item.status !== 'question_not_found')
      .map((item) => ({
        exam_history_id: result.id,
        question_id: item.question_id,
        selected_option: item.selected_option,
        is_correct: item.is_correct,
        marks_awarded: item.marks_awarded,
        created_at: new Date().toISOString(),
      }));

    if (detailRows.length > 0) {
      const { error: detailsError } = await supabase
        .from('exam_history_details')
        .insert(detailRows);

      if (detailsError) {
        console.error('Exam history details insert error:', detailsError);
      }
    }

    const earnedXP = await calculateExamXP(correct, totalQuestions);

    const { error: progressError } = await supabase.rpc('update_user_progress', {
      p_user_id: user_id,
      p_coins: 0,
      p_xp: earnedXP,
    });

    if (progressError) {
      console.error('Update user progress error:', progressError);
    }

    return {
      ...result,
      earned_xp: earnedXP,
      computed_result: {
        score: finalScore,
        total_questions: totalQuestions,
        correct_count: correct,
        wrong_count: wrong,
        skipped_count: skipped,
      },
    };
  }

  static async createGroupBattleExam(
    challengerId: string,
    opponentId: string,
    examData: any
  ) {
    if (!challengerId) throw new Error('Unauthorized');

    if (challengerId === opponentId) {
      throw new Error('আপনি নিজেকে নিজে চ্যালেঞ্জ দিতে পারবেন না!');
    }

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
        end_time: examData.end_time,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return data;
  }
}
