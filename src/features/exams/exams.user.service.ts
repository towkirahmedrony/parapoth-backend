import { supabase } from '../../config/supabase';
import { GenerateExamDTO, SubmitHistoryDTO } from './exams.types';
import {
  findOptionById,
  isAnswerCorrect,
  isAnswerDisclosureAllowed,
  isOptionCorrect,
  normalizeOptionId,
  optionDisplayText,
} from './exam.grading';

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

const sanitizeOptions = (options: any, includeCorrectAnswers = false): any[] => {
  if (!Array.isArray(options)) return [];

  return options.map((opt: any) => {
    const sanitized: AnyObject = {
      id: opt.id,
      text_bn: opt.text_bn,
      text_en: opt.text_en,
      image_url: opt.image_url ?? null,
    };

    if (includeCorrectAnswers) {
      sanitized.isCorrect = isOptionCorrect(opt);
    }

    return sanitized;
  });
};

const normalizeExplanation = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : null;
  }

  if (typeof value === 'object') {
    const explanation = value as AnyObject;
    const candidate =
      explanation.text_bn ?? explanation.text ?? explanation.bn ?? explanation.text_en ?? explanation.en;

    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return String(value);
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

const sanitizeQuestionForClient = (
  q: AnyObject,
  options: { includeCorrectAnswers?: boolean } = {}
) => ({
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

  options: sanitizeOptions(q.options, options.includeCorrectAnswers === true),

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
  return questions.map((question) => sanitizeQuestionForClient(question));
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

const EXAM_REVIEW_QUESTION_SELECT_QUERY = `${EXAM_QUESTION_SELECT_QUERY.trim()}, explanation`;

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

const buildQuestionSnapshot = (question: AnyObject, includeCorrectAnswers: boolean) => ({
  ...sanitizeQuestionForClient(question, { includeCorrectAnswers }),
  explanation: includeCorrectAnswers ? normalizeExplanation(question.explanation) : null,
});

const parseDetailsJson = (raw: unknown): AnyObject => {
  if (raw === null || raw === undefined) return {};

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as AnyObject) : {};
    } catch {
      return {};
    }
  }

  return typeof raw === 'object' ? (raw as AnyObject) : {};
};

const enrichDetailWithOptionText = (
  detail: AnyObject,
  question: AnyObject | undefined,
  includeCorrectAnswers: boolean
) => {
  const options: AnyObject[] = Array.isArray(question?.options) ? question!.options : [];
  const selectedOption = findOptionById(options, detail?.selected_option);
  const correctOption = options.find((option) => isOptionCorrect(option)) ?? null;

  const enriched: AnyObject = {
    ...detail,
    selected_option_text: detail?.selected_option_text ?? optionDisplayText(selectedOption),
  };

  if (includeCorrectAnswers) {
    enriched.correct_option_id = detail?.correct_option_id ?? (correctOption ? normalizeOptionId(correctOption.id) : null);
    enriched.correct_option_text =
      detail?.correct_option_text ?? optionDisplayText(correctOption);
  } else {
    delete enriched.correct_option_id;
    delete enriched.correct_option_text;
  }

  return enriched;
};

const loadQuestionSnapshotMap = async (
  questionIds: string[]
): Promise<Map<string, AnyObject>> => {
  if (questionIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('questions')
    .select(EXAM_REVIEW_QUESTION_SELECT_QUERY)
    .in('id', questionIds);

  if (error) throw new Error(error.message);

  const questionMap = new Map<string, AnyObject>();
  (data || []).forEach((question: AnyObject) => {
    questionMap.set(normalizeId(question.id), question);
  });

  return questionMap;
};

const loadResultPublishTime = async (examId: string | null): Promise<string | null> => {
  if (!examId) return null;

  const { data, error } = await supabase
    .from('exam_papers')
    .select('result_publish_time')
    .eq('id', examId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data?.result_publish_time ?? null;
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
    let resultPublishTime: string | null = null;

    if (exam_id) {
      const { data: examData, error: examError } = await supabase
        .from('exam_papers')
        .select('id, default_negative_marks, total_marks, result_publish_time')
        .eq('id', exam_id)
        .maybeSingle();

      if (examError) throw new Error(examError.message);
      if (!examData) throw new Error('Exam not found');

      defaultNegativeMarks = Number(examData.default_negative_marks ?? 0.25);
      examTotalMarks = Number(examData.total_marks ?? 0);
      resultPublishTime = examData.result_publish_time ?? null;
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select(EXAM_REVIEW_QUESTION_SELECT_QUERY)
      .in('id', questionIds)
      .eq('is_active', true)
      .eq('status', 'published')
      .is('deleted_at', null);

    if (questionsError) throw new Error(questionsError.message);

    const questionMap = new Map<string, AnyObject>();
    (questions || []).forEach((q: AnyObject) => {
      questionMap.set(normalizeId(q.id), q);
    });

    const includeCorrectAnswers = isAnswerDisclosureAllowed(
      exam_id ? normalizeId(exam_id) : null,
      resultPublishTime
    );

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    let totalScore = 0;

    const details = questionIds.map((questionId) => {
      const q = questionMap.get(questionId);
      const selectedOptionId = answers[questionId];
      const selectedId = isEmptyAnswer(selectedOptionId) ? null : normalizeOptionId(selectedOptionId);

      if (!q) {
        skipped++;
        return {
          question_id: questionId,
          selected_option: selectedId,
          selected_option_text: null,
          is_correct: null,
          marks_awarded: 0,
          status: 'question_not_found',
        };
      }

      const optionsArray: AnyObject[] = Array.isArray(q.options) ? q.options : [];
      const selectedOption = findOptionById(optionsArray, selectedId);
      const correctOption = optionsArray.find((option) => isOptionCorrect(option)) ?? null;

      if (!selectedId) {
        skipped++;
        return {
          question_id: questionId,
          selected_option: null,
          selected_option_text: null,
          is_correct: null,
          marks_awarded: 0,
          status: 'skipped',
        };
      }

      const isCorrect = isAnswerCorrect(optionsArray, selectedId);

      if (isCorrect) {
        correct++;
        totalScore += 1;
      } else {
        wrong++;
        totalScore -= defaultNegativeMarks;
      }

      const detail: AnyObject = {
        question_id: questionId,
        selected_option: selectedId,
        selected_option_text: optionDisplayText(selectedOption),
        is_correct: isCorrect,
        marks_awarded: isCorrect ? 1 : -defaultNegativeMarks,
        status: isCorrect ? 'correct' : 'wrong',
      };

      if (includeCorrectAnswers) {
        detail.correct_option_id = correctOption ? normalizeOptionId(correctOption.id) : null;
        detail.correct_option_text = optionDisplayText(correctOption);
      }

      return detail;
    });

    const questionSnapshots = questionIds
      .map((questionId) => questionMap.get(questionId))
      .filter((question): question is AnyObject => Boolean(question))
      .map((question) => buildQuestionSnapshot(question, includeCorrectAnswers));

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
        questions: questionSnapshots,
        correct_answers_revealed: includeCorrectAnswers,
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

  /**
   * Returns a single submitted attempt for the authenticated owner.
   * Attempts submitted after the secure grading migration already carry the
   * question snapshot; older attempts are resolved from exam_history_details
   * and the current questions table so their review page keeps working.
   */
  static async getExamResult(userId: string, historyId: string) {
    if (!userId) throw new Error('Unauthorized');

    const normalizedHistoryId = normalizeId(historyId);

    if (!normalizedHistoryId) throw new Error('Result id is required');

    const { data: record, error } = await supabase
      .from('exam_history')
      .select('*')
      .eq('id', normalizedHistoryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!record) return null;

    const detailsJson = parseDetailsJson(record.details_json);
    const storedQuestions: AnyObject[] = Array.isArray(detailsJson.questions)
      ? detailsJson.questions
      : [];
    const storedDetails: AnyObject[] = Array.isArray(detailsJson.details)
      ? detailsJson.details
      : [];

    const answers: Record<string, unknown> =
      detailsJson.answers &&
      typeof detailsJson.answers === 'object' &&
      !Array.isArray(detailsJson.answers)
        ? detailsJson.answers
        : detailsJson.userAnswers &&
            typeof detailsJson.userAnswers === 'object' &&
            !Array.isArray(detailsJson.userAnswers)
          ? detailsJson.userAnswers
          : {};

    const examId = record.exam_id ? normalizeId(record.exam_id) : null;
    const resultPublishTime = await loadResultPublishTime(examId);
    const includeCorrectAnswers = isAnswerDisclosureAllowed(examId, resultPublishTime);

    const questionIds = (
      storedQuestions.length > 0
        ? storedQuestions.map((question) => question?.id)
        : storedDetails.map((detail) => detail?.question_id)
    )
      .map(normalizeId)
      .filter(Boolean);

    const questionMap =
      questionIds.length > 0
        ? await loadQuestionSnapshotMap(questionIds)
        : new Map<string, AnyObject>();

    const storedQuestionMap = new Map<string, AnyObject>();
    storedQuestions.forEach((question) => {
      storedQuestionMap.set(normalizeId(question?.id), question);
    });

    const questions: AnyObject[] = questionIds
      .map((questionId) => {
        const currentQuestion = questionMap.get(questionId);

        if (currentQuestion) {
          return buildQuestionSnapshot(currentQuestion, includeCorrectAnswers);
        }

        return storedQuestionMap.get(questionId) ?? null;
      })
      .filter((question): question is AnyObject => Boolean(question));

    const details = storedDetails.map((detail) =>
      enrichDetailWithOptionText(
        detail,
        questionMap.get(normalizeId(detail?.question_id)),
        includeCorrectAnswers
      )
    );

    return {
      ...record,
      details_json: {
        ...detailsJson,
        answers,
        details,
        questions,
        correct_answers_revealed: includeCorrectAnswers,
        bookmarked_ids: Array.isArray(detailsJson.bookmarked_ids)
          ? detailsJson.bookmarked_ids
          : [],
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
