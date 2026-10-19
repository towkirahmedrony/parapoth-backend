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

/**
 * Explicit allowlist for a single student-facing answer detail. Historical
 * details_json rows may contain extra fields (including answer-key data) from
 * older deployments, so we never spread a stored detail into a response.
 */
const sanitizeDetailForClient = (
  detail: AnyObject,
  question: AnyObject | undefined,
  includeCorrectAnswers: boolean
) => {
  const options: AnyObject[] = Array.isArray(question?.options) ? question!.options : [];
  const selectedOption = findOptionById(options, detail?.selected_option);
  const correctOption = options.find((option) => isOptionCorrect(option)) ?? null;

  const sanitized: AnyObject = {
    question_id: normalizeId(detail?.question_id),
    selected_option: detail?.selected_option ?? null,
    selected_option_text:
      detail?.selected_option_text ?? optionDisplayText(selectedOption),
    is_correct: typeof detail?.is_correct === 'boolean' ? detail.is_correct : null,
    marks_awarded: typeof detail?.marks_awarded === 'number' ? detail.marks_awarded : 0,
    status: typeof detail?.status === 'string' ? detail.status : 'unknown',
  };

  if (typeof detail?.time_spent === 'number') {
    sanitized.time_spent = detail.time_spent;
  }

  if (includeCorrectAnswers) {
    sanitized.correct_option_id =
      detail?.correct_option_id ?? (correctOption ? normalizeOptionId(correctOption.id) : null);
    sanitized.correct_option_text =
      detail?.correct_option_text ?? optionDisplayText(correctOption);
  }

  return sanitized;
};

/**
 * Stored question snapshots are treated as untrusted legacy data. Rebuild the
 * student-facing shape from the allowlisted fields instead of returning the
 * stored object verbatim.
 */
const sanitizeStoredQuestionSnapshot = (
  question: AnyObject,
  includeCorrectAnswers: boolean
) => {
  const sanitized = sanitizeQuestionForClient(question, { includeCorrectAnswers });

  return {
    ...sanitized,
    explanation: includeCorrectAnswers ? normalizeExplanation(question?.explanation) : null,
  };
};

const sanitizeAnswerMap = (
  answers: Record<string, unknown>,
  allowedQuestionIds: Set<string>
): Record<string, string | null> => {
  const sanitized: Record<string, string | null> = {};

  Object.entries(answers || {}).forEach(([questionId, value]) => {
    const normalizedQuestionId = normalizeId(questionId);

    if (!normalizedQuestionId || !allowedQuestionIds.has(normalizedQuestionId)) return;
    if (value !== null && typeof value === 'object') return;

    const normalizedValue = isEmptyAnswer(value) ? null : String(value).trim();
    sanitized[normalizedQuestionId] = normalizedValue;
  });

  return sanitized;
};

const buildStudentFacingDetailsJson = (
  detailsJson: AnyObject,
  payload: {
    answers: Record<string, string | null>;
    details: AnyObject[];
    questions: AnyObject[];
    includeCorrectAnswers: boolean;
    bookmarkedIds?: unknown;
  }
) => ({
  session_id: detailsJson?.session_id ?? null,
  answers: payload.answers,
  details: payload.details,
  questions: payload.questions,
  correct_answers_revealed: payload.includeCorrectAnswers,
  bookmarked_ids: Array.isArray(payload.bookmarkedIds) ? payload.bookmarkedIds : [],
});

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

/**
 * Returns the authoritative question set for an exam. This relationship is the
 * only source of truth for which question ids may be graded or snapshotted.
 */
const loadExamQuestionIds = async (examId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('exam_paper_questions')
    .select('question_id, sequence')
    .eq('exam_id', examId);

  if (error) throw new Error(error.message);

  return (data || [])
    .slice()
    .sort((a: AnyObject, b: AnyObject) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    .map((row: AnyObject) => normalizeId(row.question_id))
    .filter(Boolean);
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

    const normalizedExamId = exam_id ? normalizeId(exam_id) : null;
    const answers =
      payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers)
        ? payload.answers
        : {};

    const requestedQuestionIds = buildQuestionIds(payload.question_ids, answers);

    if (requestedQuestionIds.length === 0) {
      throw new Error('No questions submitted');
    }

    let defaultNegativeMarks = 0.25;
    let examTotalMarks: number | null = null;
    let resultPublishTime: string | null = null;
    let authoritativeQuestionIds: string[] | null = null;

    if (normalizedExamId) {
      const { data: examData, error: examError } = await supabase
        .from('exam_papers')
        .select('id, default_negative_marks, total_marks, result_publish_time, is_published')
        .eq('id', normalizedExamId)
        .maybeSingle();

      if (examError) throw new Error(examError.message);
      if (!examData) throw new Error('Exam not found');
      if (examData.is_published !== true) throw new Error('Exam is not available');

      defaultNegativeMarks = Number(examData.default_negative_marks ?? 0.25);
      examTotalMarks = Number(examData.total_marks ?? 0);
      resultPublishTime = examData.result_publish_time ?? null;

      authoritativeQuestionIds = await loadExamQuestionIds(normalizedExamId);

      if (authoritativeQuestionIds.length === 0) {
        throw new Error('Exam question set is not configured');
      }

      const allowedQuestionIds = new Set(authoritativeQuestionIds);
      const unauthorizedQuestionIds = requestedQuestionIds.filter(
        (questionId) => !allowedQuestionIds.has(questionId)
      );

      if (unauthorizedQuestionIds.length > 0) {
        throw new Error('Submitted question does not belong to this exam');
      }
    }

    // Practice attempts without an exam paper may only reference published
    // questions, and never disclose the answer key (see the gate below).
    const questionIds = authoritativeQuestionIds
      ? authoritativeQuestionIds.filter((questionId) =>
          requestedQuestionIds.includes(questionId)
        )
      : requestedQuestionIds;

    if (questionIds.length === 0) {
      throw new Error('No questions submitted');
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
      normalizedExamId,
      resultPublishTime
    );

    // Questions without a submitted answer never reveal their correct option,
    // even when the exam policy permits review. This prevents a caller from
    // harvesting the key by sending bare question ids.
    const answeredQuestionIds = new Set(
      questionIds.filter((questionId) => !isEmptyAnswer(answers[questionId]))
    );
    const revealKeys = includeCorrectAnswers && answeredQuestionIds.size > 0;

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
        return sanitizeDetailForClient(
          {
            question_id: questionId,
            selected_option: selectedId,
            selected_option_text: null,
            is_correct: null,
            marks_awarded: 0,
            status: 'question_not_found',
          },
          undefined,
          false
        );
      }

      const optionsArray: AnyObject[] = Array.isArray(q.options) ? q.options : [];
      const selectedOption = findOptionById(optionsArray, selectedId);

      if (!selectedId) {
        skipped++;
        return sanitizeDetailForClient(
          {
            question_id: questionId,
            selected_option: null,
            selected_option_text: null,
            is_correct: null,
            marks_awarded: 0,
            status: 'skipped',
          },
          q,
          false
        );
      }

      const isCorrect = isAnswerCorrect(optionsArray, selectedId);

      if (isCorrect) {
        correct++;
        totalScore += 1;
      } else {
        wrong++;
        totalScore -= defaultNegativeMarks;
      }

      return sanitizeDetailForClient(
        {
          question_id: questionId,
          selected_option: selectedId,
          selected_option_text: optionDisplayText(selectedOption),
          is_correct: isCorrect,
          marks_awarded: isCorrect ? 1 : -defaultNegativeMarks,
          status: isCorrect ? 'correct' : 'wrong',
        },
        q,
        revealKeys
      );
    });

    const questionSnapshots = questionIds
      .map((questionId) => ({ questionId, question: questionMap.get(questionId) }))
      .filter((entry): entry is { questionId: string; question: AnyObject } =>
        Boolean(entry.question)
      )
      .map(({ questionId, question }) =>
        buildQuestionSnapshot(question, revealKeys && answeredQuestionIds.has(questionId))
      );

    const sanitizedAnswers = sanitizeAnswerMap(
      answers as Record<string, unknown>,
      new Set(questionIds)
    );

    const totalQuestions = questionIds.length;
    const finalScore = Math.max(0, Number(totalScore.toFixed(2)));

    const detailsJson = buildStudentFacingDetailsJson(
      { session_id: session_id || null },
      {
        answers: sanitizedAnswers,
        details,
        questions: questionSnapshots,
        includeCorrectAnswers: revealKeys,
      }
    );

    const resultPayload = {
      exam_id: normalizedExamId,
      user_id,
      score: finalScore,
      total_marks: examTotalMarks || totalQuestions,
      correct_count: correct,
      wrong_count: wrong,
      skipped_count: skipped,
      time_taken: Number(time_taken || 0),
      details_json: detailsJson,
      submitted_at: new Date().toISOString(),
    };

    const { data: result, error: submitError } = await supabase
      .from('exam_history')
      .insert([resultPayload])
      .select()
      .single();

    if (submitError) throw new Error(submitError.message);

    if (!result?.id) {
      throw new Error('Failed to persist exam result');
    }

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

    // Explicit response DTO: never spread the database row (which may contain
    // grading-only fields in future schema versions).
    return {
      id: result.id,
      exam_id: result.exam_id ?? normalizedExamId,
      user_id: result.user_id ?? user_id,
      score: Number(result.score ?? finalScore),
      total_marks: Number(result.total_marks ?? (examTotalMarks || totalQuestions)),
      correct_count: Number(result.correct_count ?? correct),
      wrong_count: Number(result.wrong_count ?? wrong),
      skipped_count: Number(result.skipped_count ?? skipped),
      time_taken: Number(result.time_taken ?? time_taken ?? 0),
      submitted_at: result.submitted_at ?? null,
      created_at: result.created_at ?? null,
      details_json: detailsJson,
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

    const storedAnswers =
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

    // Legacy attempts may have been written through the trust-based history
    // endpoint, so their stored question ids are untrusted. When an exam is set,
    // only questions in that exam's authoritative question set are reviewable.
    const authorizedQuestionIds = examId
      ? new Set(await loadExamQuestionIds(examId))
      : null;

    const storedQuestionIds = (
      storedQuestions.length > 0
        ? storedQuestions.map((question) => question?.id)
        : storedDetails.map((detail) => detail?.question_id)
    )
      .map(normalizeId)
      .filter(Boolean);

    const questionIds = authorizedQuestionIds
      ? storedQuestionIds.filter((questionId) => authorizedQuestionIds.has(questionId))
      : storedQuestionIds;

    const reviewableDetails = authorizedQuestionIds
      ? storedDetails.filter((detail) =>
          authorizedQuestionIds.has(normalizeId(detail?.question_id))
        )
      : storedDetails;

    const answeredQuestionIds = new Set(
      Object.entries(storedAnswers as Record<string, unknown>)
        .filter(([, value]) => !isEmptyAnswer(value))
        .map(([questionId]) => normalizeId(questionId))
        .filter((questionId) => questionIds.includes(questionId))
    );
    const revealKeys = includeCorrectAnswers && answeredQuestionIds.size > 0;

    const questionMap =
      questionIds.length > 0
        ? await loadQuestionSnapshotMap(questionIds)
        : new Map<string, AnyObject>();

    const storedQuestionMap = new Map<string, AnyObject>();
    storedQuestions.forEach((question) => {
      storedQuestionMap.set(normalizeId(question?.id), question);
    });

    const questions: AnyObject[] = questionIds
      .map((questionId): AnyObject | null => {
        const revealForQuestion = revealKeys && answeredQuestionIds.has(questionId);
        const currentQuestion = questionMap.get(questionId);

        if (currentQuestion) {
          return buildQuestionSnapshot(currentQuestion, revealForQuestion);
        }

        const storedQuestion = storedQuestionMap.get(questionId);

        return storedQuestion
          ? sanitizeStoredQuestionSnapshot(storedQuestion, revealForQuestion)
          : null;
      })
      .filter((question): question is AnyObject => question !== null);

    const details = reviewableDetails.map((detail) =>
      sanitizeDetailForClient(
        detail,
        questionMap.get(normalizeId(detail?.question_id)),
        revealKeys && !isEmptyAnswer(detail?.selected_option)
      )
    );

    const answers = sanitizeAnswerMap(
      storedAnswers as Record<string, unknown>,
      new Set(questionIds)
    );

    return {
      id: record.id,
      exam_id: record.exam_id ?? null,
      user_id: record.user_id ?? null,
      score: Number(record.score ?? 0),
      total_marks: Number(record.total_marks ?? 0),
      correct_count: Number(record.correct_count ?? 0),
      wrong_count: Number(record.wrong_count ?? 0),
      skipped_count: Number(record.skipped_count ?? 0),
      time_taken: Number(record.time_taken ?? 0),
      submitted_at: record.submitted_at ?? null,
      created_at: record.created_at ?? null,
      status: record.status ?? null,
      details_json: buildStudentFacingDetailsJson(detailsJson, {
        answers,
        details,
        questions,
        includeCorrectAnswers: revealKeys,
        bookmarkedIds: detailsJson.bookmarked_ids,
      }),
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
