import cron from 'node-cron';
import { supabaseAdmin as supabase } from '../config/supabaseAdmin';
import logger from '../lib/utils/logger';
import { generateVectorEmbedding } from '../features/ai/ai.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const processStaleEmbeddings = async () => {
  try {
    const { data: staleQuestions, error: fetchError } = await supabase
      .from('questions')
      .select('id, body, subject_id')
      .eq('is_embedding_stale', true)
      .limit(12);

    if (fetchError) {
      logger.error('Error fetching stale embeddings:', fetchError);
      return;
    }

    if (!staleQuestions || staleQuestions.length === 0) return;

    logger.info(`Started processing ${staleQuestions.length} stale embeddings...`);

    for (const question of staleQuestions) {
      try {
        const textToEmbed = JSON.stringify(question.body);
        const embeddingVector = await generateVectorEmbedding(textToEmbed);

        const { data: matches, error: matchError } = await supabase.rpc('match_questions', {
          query_embedding: JSON.stringify(embeddingVector), 
          match_threshold: 0.85,
          match_count: 2,
          filter_subject_id: question.subject_id
        });

        if (matchError) {
          logger.error(`Match error for question ${question.id}:`, matchError);
          continue;
        }

        const duplicate = matches?.find((m: { id: string, similarity: number }) => m.id !== question.id);

        const updatePayload: Record<string, string | boolean | number | null> = {
          embedding: JSON.stringify(embeddingVector),
          is_embedding_stale: false,
          embedding_updated_at: new Date().toISOString()
        };

        if (duplicate) {
          const similarityPercent = (duplicate.similarity * 100).toFixed(1);
          updatePayload.status = 'pending';
          updatePayload.audit_notes = `[System Flag] Potential duplicate of Question ID: ${duplicate.id} (${similarityPercent}% match).`;
          updatePayload.confidence_score = 65; 
        } else {
          updatePayload.status = 'published';
          updatePayload.confidence_score = 95;
        }

        const { error: updateError } = await supabase
          .from('questions')
          .update(updatePayload)
          .eq('id', question.id);

        if (updateError) {
           logger.error(`Failed to update DB for question ${question.id}:`, updateError);
        }

        await sleep(4000);

      } catch (qError: unknown) {
        const err = qError as Error;
        logger.error(`Failed processing question ${question.id}:`, err.message || err);
        
        if (err.message && err.message.includes('429')) {
           logger.warn('Rate limit hit on embedding API! Pausing worker for 1 minute...');
           await sleep(60000); 
        }
      }
    }

    logger.info(`Successfully finished embedding batch processing.`);

  } catch (error: unknown) {
    logger.error('Error in embedding worker:', error);
  }
};

export const startEmbeddingWorker = () => {
  cron.schedule('*/5 * * * *', processStaleEmbeddings);
  logger.info('Embedding Background Worker scheduled (runs every 5 minutes).');
};
