import { supabase } from '../../config/supabase';
import {
  ATTEMPT_KIND,
  ATTEMPT_STATUS,
  checkExamWindow,
  isAttemptExpired,
  resolveAttemptDeadline,
  resolvePracticeDeadline,
} from './exam.timing';

type AnyObject = Record<string, any>;

export class ExamAttemptError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ExamAttemptError';
    this.status = status;
  }
}

export const ATTEMPT_SELECT =
  'id, user_id, exam_id, kind, status, started_at, deadline_at, submitted_at, answers_draft, current_question_index, time_remaining, last_updated_at, exam_history_id, question_ids';

const MAX_PRACTICE_QUESTIONS = 100;

const normalizeId = (value: unknown): string => String(value ?? '').trim();

const toIso = (epochMs: number): string => new Date(epochMs).toISOString();

const secondsUntil = (deadlineAt: unknown, nowMs: number): number | null => {
  if (!deadlineAt) return null;

  const deadline = Date.parse(String(deadlineAt));

  if (Number.isNaN(deadline)) return null;

  return Math.max(0, Math.ceil((deadline - nowMs) / 1000));
};

export type AttemptDto = {
  id: string;
  exam_id: string | null;
  kind: string;
  status: string;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  server_time: string;
  seconds_remaining: number | null;
  answers_draft: AnyObject;
  current_question_index: number;
  question_ids: string[];
};

const toAttemptDto = (row: AnyObject, nowMs = Date.now()): AttemptDto => ({
  id: row.id,
  exam_id: row.exam_id ?? null,
  kind: row.kind ?? ATTEMPT_KIND.EXAM,
  status: row.status,
  started_at: row.started_at ?? null,
  deadline_at: row.deadline_at ?? null,
  submitted_at: row.submitted_at ?? null,
  server_time: toIso(nowMs),
  seconds_remaining: secondsUntil(row.deadline_at, nowMs),
  answers_draft:
    row.answers_draft && typeof row.answers_draft === 'object' && !Array.isArray(row.answers_draft)
      ? row.answers_draft
      : {},
  current_question_index: Number(row.current_question_index ?? 0),
  question_ids: Array.isArray(row.question_ids) ? row.question_ids.map(normalizeId).filter(Boolean) : [],
});

const loadExamPaper = async (examId: string) => {
  const { data, error } = await supabase
    .from('exam_papers')
    .select('id, is_published, duration_min, start_time, end_time, default_negative_marks, total_marks, result_publish_time')
    .eq('id', examId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

const loadAuthoritativeQuestionIds = async (examId: string): Promise<string[]> => {
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

const loadPublishedQuestionIds = async (questionIds: string[]): Promise<string[]> => {
  if (questionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('questions')
    .select('id')
    .in('id', questionIds)
    .eq('is_active', true)
    .eq('status', 'published')
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  return (data || []).map((row: AnyObject) => normalizeId(row.id)).filter(Boolean);
};

const loadPracticeDurationMinutes = async (): Promise<number | null> => {
  const { data, error } = await supabase
    .from('app_configs')
    .select('value')
    .eq('key', 'arena_config')
    .maybeSingle();

  if (error) return null;

  const value = (data?.value as AnyObject) || {};
  const duration = Number(value.practice_duration_min ?? value.duration_min);

  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

export class ExamAttemptService {
  static async getAttempt(userId: string, attemptId: string) {
    const normalizedAttemptId = normalizeId(attemptId);

    if (!userId) throw new ExamAttemptError('Unauthorized', 401);
    if (!normalizedAttemptId) throw new ExamAttemptError('Attempt id is required', 400);

    const { data, error } = await supabase
      .from('exam_progress')
      .select(ATTEMPT_SELECT)
      .eq('id', normalizedAttemptId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data ?? null;
  }

  static async findActiveExamAttempt(userId: string, examId: string) {
    const { data, error } = await supabase
      .from('exam_progress')
      .select(ATTEMPT_SELECT)
      .eq('user_id', userId)
      .eq('exam_id', normalizeId(examId))
      .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data ?? null;
  }

  static async expireAttempt(attemptId: string): Promise<void> {
    try {
      await supabase
        .from('exam_progress')
        .update({ status: ATTEMPT_STATUS.EXPIRED, last_updated_at: new Date().toISOString() })
        .eq('id', attemptId)
        .eq('status', ATTEMPT_STATUS.IN_PROGRESS);
    } catch {
      // Best effort: the authoritative deadline still blocks further use.
    }
  }

  static async startExamAttempt(userId: string, examId: string): Promise<AttemptDto> {
    if (!userId) throw new ExamAttemptError('Unauthorized', 401);

    const normalizedExamId = normalizeId(examId);
    if (!normalizedExamId) throw new ExamAttemptError('Exam id is required', 400);

    const exam = await loadExamPaper(normalizedExamId);
    if (!exam) throw new ExamAttemptError('Exam not found', 404);
    if (exam.is_published !== true) throw new ExamAttemptError('Exam is not available', 403);

    const now = Date.now();
    const window = checkExamWindow(exam, now);

    if (!window.allowed) {
      throw new ExamAttemptError(
        window.reason === 'not_started' ? 'Exam has not started yet' : 'Exam window is closed',
        403
      );
    }

    const existing = await ExamAttemptService.findActiveExamAttempt(userId, normalizedExamId);

    if (existing) {
      if (isAttemptExpired(existing.deadline_at, now)) {
        await ExamAttemptService.expireAttempt(existing.id);
        throw new ExamAttemptError('Exam attempt has expired', 409);
      }

      return toAttemptDto(existing, now);
    }

    const questionIds = await loadAuthoritativeQuestionIds(normalizedExamId);
    if (questionIds.length === 0) {
      throw new ExamAttemptError('Exam question set is not configured', 400);
    }

    const deadline = resolveAttemptDeadline(exam, now);
    if (deadline === null) {
      throw new ExamAttemptError('Exam does not define an authoritative duration', 400);
    }

    const insertPayload = {
      user_id: userId,
      exam_id: normalizedExamId,
      kind: ATTEMPT_KIND.EXAM,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      started_at: toIso(now),
      deadline_at: toIso(deadline),
      question_ids: questionIds,
      answers_draft: {},
      current_question_index: 0,
      time_remaining: secondsUntil(toIso(deadline), now),
      last_updated_at: toIso(now),
    };

    const { data, error } = await supabase
      .from('exam_progress')
      .insert([insertPayload])
      .select(ATTEMPT_SELECT)
      .single();

    if (error) {
      // A concurrent start won the partial unique index; resume that attempt
      // instead of creating a second one.
      if ((error as AnyObject).code === '23505') {
        const { data: concurrent } = await supabase
          .from('exam_progress')
          .select(ATTEMPT_SELECT)
          .eq('user_id', userId)
          .eq('exam_id', normalizedExamId)
          .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
          .maybeSingle();

        if (concurrent) return toAttemptDto(concurrent, now);
      }

      throw new Error(error.message);
    }

    return toAttemptDto(data, now);
  }

  static async startPracticeAttempt(
    userId: string,
    questionIds: unknown
  ): Promise<AttemptDto> {
    if (!userId) throw new ExamAttemptError('Unauthorized', 401);

    const normalized = Array.from(
      new Set(
        (Array.isArray(questionIds) ? questionIds : [])
          .map(normalizeId)
          .filter(Boolean)
      )
    );

    if (normalized.length === 0) throw new ExamAttemptError('Question ids are required', 400);
    if (normalized.length > MAX_PRACTICE_QUESTIONS) {
      throw new ExamAttemptError('Too many questions for a practice attempt', 400);
    }

    const published = await loadPublishedQuestionIds(normalized);
    const publishedSet = new Set(published);
    const unavailable = normalized.filter((id) => !publishedSet.has(id));

    if (unavailable.length > 0) {
      throw new ExamAttemptError('One or more questions are not available', 400);
    }

    const now = Date.now();
    const durationMinutes = await loadPracticeDurationMinutes();
    const deadline = resolvePracticeDeadline(now, durationMinutes);

    const { data, error } = await supabase
      .from('exam_progress')
      .insert([
        {
          user_id: userId,
          exam_id: null,
          kind: ATTEMPT_KIND.PRACTICE,
          status: ATTEMPT_STATUS.IN_PROGRESS,
          started_at: toIso(now),
          deadline_at: toIso(deadline),
          question_ids: normalized,
          answers_draft: {},
          current_question_index: 0,
          time_remaining: secondsUntil(toIso(deadline), now),
          last_updated_at: toIso(now),
        },
      ])
      .select(ATTEMPT_SELECT)
      .single();

    if (error) throw new Error(error.message);

    return toAttemptDto(data, now);
  }

  static async getAttemptState(userId: string, attemptId: string): Promise<AttemptDto> {
    const attempt = await ExamAttemptService.getAttempt(userId, attemptId);

    if (!attempt) throw new ExamAttemptError('Attempt not found', 404);

    if (
      attempt.status === ATTEMPT_STATUS.IN_PROGRESS &&
      isAttemptExpired(attempt.deadline_at)
    ) {
      await ExamAttemptService.expireAttempt(attempt.id);

      return toAttemptDto({ ...attempt, status: ATTEMPT_STATUS.EXPIRED });
    }

    return toAttemptDto(attempt);
  }

  static async saveDraftAnswers(
    userId: string,
    attemptId: string,
    answers: unknown,
    currentQuestionIndex?: unknown
  ): Promise<AttemptDto> {
    const attempt = await ExamAttemptService.getAttempt(userId, attemptId);

    if (!attempt) throw new ExamAttemptError('Attempt not found', 404);
    if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
      throw new ExamAttemptError('Attempt is no longer in progress', 409);
    }
    if (isAttemptExpired(attempt.deadline_at)) {
      await ExamAttemptService.expireAttempt(attempt.id);
      throw new ExamAttemptError('Exam attempt has expired', 409);
    }

    const safeAnswers =
      answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};

    const index = Number(currentQuestionIndex);
    const now = Date.now();

    // The update is conditional on in_progress AND an unexpired deadline so a
    // concurrent submit/expire cannot be overwritten, and it never touches
    // started_at/deadline_at (a retry can never extend the exam).
    const { data, error } = await supabase
      .from('exam_progress')
      .update({
        answers_draft: safeAnswers,
        current_question_index: Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0,
        last_updated_at: toIso(now),
      })
      .eq('id', attempt.id)
      .eq('user_id', userId)
      .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
      .gt('deadline_at', toIso(now))
      .select(ATTEMPT_SELECT);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new ExamAttemptError('Attempt is no longer in progress', 409);
    }

    return toAttemptDto(data[0], now);
  }

  /**
   * Atomically claims an attempt for submission. Only one caller can win; a
   * losing caller receives claimed=false and must return the existing result.
   */
  static async claimAttemptForSubmission(
    userId: string,
    attemptId: string,
    examHistoryId: string
  ): Promise<{ attempt: AnyObject; claimed: boolean }> {
    const attempt = await ExamAttemptService.getAttempt(userId, attemptId);

    if (!attempt) throw new ExamAttemptError('Attempt not found', 404);

    if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
      return { attempt, claimed: false };
    }

    if (isAttemptExpired(attempt.deadline_at)) {
      await ExamAttemptService.expireAttempt(attempt.id);

      return { attempt: { ...attempt, status: ATTEMPT_STATUS.EXPIRED }, claimed: false };
    }

    const now = Date.now();
    const { data, error } = await supabase
      .from('exam_progress')
      .update({
        status: ATTEMPT_STATUS.SUBMITTED,
        submitted_at: toIso(now),
        exam_history_id: examHistoryId,
        last_updated_at: toIso(now),
      })
      .eq('id', attempt.id)
      .eq('user_id', userId)
      .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
      .gt('deadline_at', toIso(now))
      .select(ATTEMPT_SELECT);

    if (error) throw new Error(error.message);

    if (!data || data.length === 0) {
      const latest = await ExamAttemptService.getAttempt(userId, attemptId);

      return { attempt: latest ?? { ...attempt, status: ATTEMPT_STATUS.SUBMITTED }, claimed: false };
    }

    return { attempt: data[0], claimed: true };
  }

  /**
   * Marks a claimed attempt finalized and records the awarded XP for audit. The
   * update is conditional on `submitted`, so finalization can never happen twice
   * and can never resurrect an attempt in another state.
   */
  static async finalizeAttempt(
    attemptId: string,
    examHistoryId: string | null,
    awardedXp: number
  ): Promise<void> {
    try {
      await supabase
        .from('exam_progress')
        .update({
          status: ATTEMPT_STATUS.FINALIZED,
          exam_history_id: examHistoryId,
          awarded_xp: Math.max(0, Math.trunc(Number(awardedXp) || 0)),
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', attemptId)
        .eq('status', ATTEMPT_STATUS.SUBMITTED);
    } catch {
      // The claimed attempt plus its single history row keep retries idempotent
      // even if this best-effort bookkeeping update fails.
    }
  }

  static async releaseClaim(attemptId: string): Promise<void> {
    try {
      await supabase
        .from('exam_progress')
        .update({
          status: ATTEMPT_STATUS.IN_PROGRESS,
          submitted_at: null,
          exam_history_id: null,
        })
        .eq('id', attemptId)
        .eq('status', ATTEMPT_STATUS.SUBMITTED);
    } catch {
      // Best effort rollback; a stuck attempt can be recovered by an operator.
    }
  }

  static async findHistoryByAttempt(attemptId: string) {
    const { data, error } = await supabase
      .from('exam_history')
      .select('*')
      .eq('attempt_id', attemptId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data ?? null;
  }
}
