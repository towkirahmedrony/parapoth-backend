import { supabase } from '../../config/supabase';
import logger from '../../lib/utils/logger';
import { AutoFetchDTO, PunishUserDTO } from './exams.types';
import { ATTEMPT_STATUS, MINUTE_MS } from './exam.timing';

type AnyObject = Record<string, any>;

const RECOVER_MIN_MINUTES = 1;
const RECOVER_MAX_MINUTES = 60;

/** Admin-facing error carrying the HTTP status the handler should return. */
class ExamAdminError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ExamAdminError';
    this.status = status;
  }
}

const secondsRemaining = (deadlineAt: unknown, nowMs = Date.now()): number | null => {
  if (!deadlineAt) return null;

  const deadline = Date.parse(String(deadlineAt));

  if (Number.isNaN(deadline)) return null;

  return Math.max(0, Math.ceil((deadline - nowMs) / 1000));
};

export class ExamAdminService {
  static async getAllExams() {
    const { data, error } = await supabase.from('exam_papers').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  static async getExamDetails(id: string) {
    const { data, error } = await supabase
      .from('exam_papers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Exam not found');
    return data;
  }

  static async deleteExam(id: string) {
    const { data, error } = await supabase.from('exam_papers').delete().eq('id', id).select();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Admin-only publication toggle. Publishing validates that the paper is a
   * complete exam (question set + authoritative duration) so an incomplete or
   * unauthorized paper cannot enter the published catalog. This is the ONLY
   * path that may set is_published to true.
   */
  static async togglePublish(id: string) {
    const exam = await ExamAdminService.getExamDetails(id);

    if (!exam) throw new Error('Exam not found');

    const nextPublished = !exam.is_published;

    if (nextPublished) {
      const duration = Number(exam.duration_min);

      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('Cannot publish an exam without a valid duration');
      }

      const { count, error: countError } = await supabase
        .from('exam_paper_questions')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', id);

      if (countError) throw new Error(countError.message);

      if (!count) {
        throw new Error('Cannot publish an exam without questions');
      }
    }

    const { data, error } = await supabase
      .from('exam_papers')
      .update({ is_published: nextPublished })
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

  /**
   * Applies a moderation action to one user.
   *
   * `zero_marks` is always scoped to a single exam: without an exam id it would
   * previously zero every result the user ever recorded. Unknown actions are a
   * client error rather than a silent no-op.
   */
  static async punishUser(payload: PunishUserDTO & { exam_id?: string }, adminId?: string) {
    const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : '';

    if (!userId) {
      throw new ExamAdminError('userId is required', 400);
    }

    const action = payload?.action;

    if (action === 'zero_marks') {
      const examId =
        typeof payload?.examId === 'string' && payload.examId.trim()
          ? payload.examId.trim()
          : typeof payload?.exam_id === 'string' && payload.exam_id.trim()
            ? payload.exam_id.trim()
            : '';

      if (!examId) {
        throw new ExamAdminError('examId is required for the zero_marks action', 400);
      }

      const { data, error } = await supabase
        .from('exam_history')
        .update({ score: 0, status: 'fraud_detected' })
        .eq('user_id', userId)
        .eq('exam_id', examId)
        .select('id');

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new ExamAdminError('No exam result found for this user and exam', 404);
      }

      logger.warn('[exam-admin] zeroed exam result', {
        adminId: adminId ?? null,
        userId,
        examId,
        affected: data.length,
      });

      return { success: true, action, userId, examId, affected: data.length };
    }

    if (action === 'ban_device') {
      const { data, error } = await supabase
        .from('profiles')
        .update({ account_status: 'suspended' })
        .eq('id', userId)
        .select('id');

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new ExamAdminError('User not found', 404);
      }

      logger.warn('[exam-admin] suspended user account', { adminId: adminId ?? null, userId });

      return { success: true, action, userId };
    }

    throw new ExamAdminError(`Unsupported action: ${String(action)}`, 400);
  }

  /**
   * Live view of an exam: only attempts that are still in progress.
   *
   * `time_remaining` is not maintained after attempt creation, so remaining
   * time is always derived from the authoritative `deadline_at`.
   */
  static async getLiveProgress(examId: string) {
    if (!examId) throw new ExamAdminError('Exam id is required', 400);

    const { data, error } = await supabase
      .from('exam_progress')
      .select('id, user_id, current_question_index, status, deadline_at, last_updated_at, profiles(full_name)')
      .eq('exam_id', examId)
      .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
      .order('last_updated_at', { ascending: false });

    if (error) throw new Error(error.message);

    const now = Date.now();

    return (data || []).map((progress: AnyObject) => ({
      id: progress.id,
      user_id: progress.user_id,
      user_name: progress.profiles?.full_name || 'Unknown User',
      current_question_index: Number(progress.current_question_index ?? 0),
      status: progress.status,
      deadline_at: progress.deadline_at ?? null,
      seconds_remaining: secondsRemaining(progress.deadline_at, now),
      last_updated_at: progress.last_updated_at ?? null,
    }));
  }

  static async getLeaderboard(examId: string) {
    const { data, error } = await supabase
      .from('exam_history')
      .select('id, user_id, score, total_marks, time_taken, device_type, status, profiles(full_name)')
      .eq('exam_id', examId)
      .order('score', { ascending: false })
      .order('time_taken', { ascending: true });
    if (error) throw new Error(error.message);

    return data.map((entry: any) => ({
      ...entry,
      user_name: entry.profiles?.full_name || 'Unknown User'
    }));
  }

  /**
   * Extends an eligible attempt.
   *
   * Recovery is a real extension: it only applies to an attempt that is still
   * `in_progress` or already `expired`, it refuses once a result exists, and it
   * moves the deadline to `max(now, deadline_at) + extend_minutes`. The update
   * is conditional so a concurrent submission or expiry cannot be reopened.
   */
  static async recoverSession(progressId: string, extendMinutes: unknown, adminId?: string) {
    const attemptId = typeof progressId === 'string' ? progressId.trim() : '';

    if (!attemptId) throw new ExamAdminError('progressId is required', 400);

    const minutes = Number(extendMinutes);

    if (
      !Number.isInteger(minutes) ||
      minutes < RECOVER_MIN_MINUTES ||
      minutes > RECOVER_MAX_MINUTES
    ) {
      throw new ExamAdminError(
        `extend_minutes must be a whole number between ${RECOVER_MIN_MINUTES} and ${RECOVER_MAX_MINUTES}`,
        400
      );
    }

    const { data: attempt, error: readError } = await supabase
      .from('exam_progress')
      .select('id, user_id, exam_id, kind, status, deadline_at, exam_history_id')
      .eq('id', attemptId)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!attempt) throw new ExamAdminError('Attempt not found', 404);

    if (
      attempt.status !== ATTEMPT_STATUS.IN_PROGRESS &&
      attempt.status !== ATTEMPT_STATUS.EXPIRED
    ) {
      throw new ExamAdminError(
        `Attempt cannot be recovered from status '${attempt.status}'`,
        409
      );
    }

    const { data: existingResult, error: historyError } = await supabase
      .from('exam_history')
      .select('id')
      .eq('attempt_id', attemptId)
      .maybeSingle();

    if (historyError) throw new Error(historyError.message);

    if (existingResult || attempt.exam_history_id) {
      throw new ExamAdminError('A result already exists for this attempt', 409);
    }

    const now = Date.now();
    const currentDeadline = Date.parse(String(attempt.deadline_at));
    const base = Number.isFinite(currentDeadline) ? Math.max(now, currentDeadline) : now;
    const nextDeadline = new Date(base + minutes * MINUTE_MS);
    const remaining = secondsRemaining(nextDeadline.toISOString(), now);

    const { data: updated, error } = await supabase
      .from('exam_progress')
      .update({
        status: ATTEMPT_STATUS.IN_PROGRESS,
        deadline_at: nextDeadline.toISOString(),
        time_remaining: remaining,
        last_updated_at: new Date().toISOString(),
      })
      .eq('id', attemptId)
      .in('status', [ATTEMPT_STATUS.IN_PROGRESS, ATTEMPT_STATUS.EXPIRED])
      .is('exam_history_id', null)
      .select()
      .single();

    if (error) throw new Error(error.message);

    logger.warn('[exam-admin] attempt extended', {
      adminId: adminId ?? null,
      attemptId,
      userId: attempt.user_id ?? null,
      examId: attempt.exam_id ?? null,
      extendMinutes: minutes,
      deadlineAt: updated?.deadline_at ?? nextDeadline.toISOString(),
    });

    // Best-effort audit trail; a failure here must not undo the extension.
    try {
      await supabase.from('audit_logs').insert({
        user_id: adminId ?? null,
        action: 'exam_attempt_recovered',
        target_table: 'exam_progress',
        target_id: attemptId,
        details: {
          extend_minutes: minutes,
          previous_deadline_at: attempt.deadline_at ?? null,
          deadline_at: updated?.deadline_at ?? nextDeadline.toISOString(),
        },
      });
    } catch {
      // ignore audit failures
    }

    return {
      ...updated,
      seconds_remaining: secondsRemaining(updated?.deadline_at, now),
      extended_by_minutes: minutes,
    };
  }
}
