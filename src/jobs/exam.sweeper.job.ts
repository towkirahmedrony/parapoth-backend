import cron from 'node-cron';
import { supabase } from '../config/supabase';
import logger from '../lib/utils/logger';
import { ATTEMPT_STATUS, resolveSubmitGraceMs } from '../features/exams/exam.timing';

const BATCH_SIZE = 500;

/** Guards against overlapping runs when a sweep takes longer than the interval. */
let isSweeping = false;

/**
 * Marks attempts that are past `deadline_at + submission grace` as expired.
 *
 * An attempt inside its grace window is deliberately left in progress: the
 * student's automatic submission at timer zero must still be accepted. Expiring
 * an attempt is only bookkeeping here; drafts are preserved so a follow-up
 * automatic grading pass (documented follow-up) can still grade them from
 * `answers_draft` through the normal submission lifecycle.
 */
export const sweepExpiredAttempts = async (nowMs: number = Date.now()): Promise<number> => {
  if (isSweeping) return 0;

  isSweeping = true;

  try {
    const graceMs = resolveSubmitGraceMs();
    const cutoff = new Date(nowMs - graceMs).toISOString();

    const { data: candidates, error } = await supabase
      .from('exam_progress')
      .select('id')
      .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
      .lt('deadline_at', cutoff)
      .limit(BATCH_SIZE);

    if (error) {
      logger.error('[exam-sweeper] failed to load expired attempts', { message: error.message });
      return 0;
    }

    if (!candidates || candidates.length === 0) return 0;

    let expired = 0;

    for (const candidate of candidates) {
      const { error: updateError } = await supabase
        .from('exam_progress')
        .update({
          status: ATTEMPT_STATUS.EXPIRED,
          last_updated_at: new Date(nowMs).toISOString(),
        })
        .eq('id', candidate.id)
        .eq('status', ATTEMPT_STATUS.IN_PROGRESS)
        // Re-checked per row so an attempt claimed for submission between the
        // read and this write is never expired underneath the student.
        .lt('deadline_at', cutoff);

      if (updateError) {
        logger.error('[exam-sweeper] failed to expire attempt', {
          attemptId: candidate.id,
          message: updateError.message,
        });
        continue;
      }

      expired += 1;
    }

    if (expired > 0) {
      logger.info('[exam-sweeper] expired attempts', { count: expired, cutoff });
    }

    return expired;
  } catch (error) {
    logger.error('[exam-sweeper] unexpected failure', error);
    return 0;
  } finally {
    isSweeping = false;
  }
};

export const startExamAttemptSweeper = (): void => {
  cron.schedule('*/5 * * * *', () => {
    // The job handles its own errors; the catch is a last line of defence so a
    // rejected promise can never become an unhandled rejection.
    void sweepExpiredAttempts().catch((error) => {
      logger.error('[exam-sweeper] unhandled rejection', error);
    });
  });

  logger.info('Exam attempt sweeper scheduled (runs every 5 minutes).');
};
