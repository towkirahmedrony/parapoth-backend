import { supabase } from '../../config/supabase';
import { ComprehensionPayload, QuestionBankFilters, QuestionBankResult, QuestionBankStats, QuestionPayload } from './content.types';
import type { TablesInsert, TablesUpdate } from '../../types/database.type';
import { generateContentHash, escapePostgrestLikeValue, hasExplanation, hasCorrectAnswer, hasMedia } from './content.utils';
import { autoCreateMissingInstitutions } from './institution.service';

const QUESTION_BANK_SELECT = `
  id, body, options, explanation, difficulty_level, type, status, created_at, updated_at, subject_id, chapter_id, topic_id, tags, media_id, explanation_media_id, source_type, exam_references, is_active, confidence_score
`;

const STATUS_KEYS: Array<keyof Pick<QuestionBankStats, 'published' | 'approved' | 'pending' | 'review' | 'draft' | 'archived' | 'deleted' | 'rejected' | 'flagged'>> = [
  'published', 'approved', 'pending', 'review', 'draft', 'archived', 'deleted', 'rejected', 'flagged',
];

const applyQuestionBankFilters = <T extends any>(
  query: T,
  filters: QuestionBankFilters,
  options: { includeStatus?: boolean } = { includeStatus: true }
): T => {
  let nextQuery = query as any;

  if (filters.subject_id) nextQuery = nextQuery.eq('subject_id', filters.subject_id);
  if (filters.chapter_id) nextQuery = nextQuery.eq('chapter_id', filters.chapter_id);
  if (filters.topic_id) nextQuery = nextQuery.eq('topic_id', filters.topic_id);
  if (filters.difficulty) nextQuery = nextQuery.eq('difficulty_level', filters.difficulty);
  if (filters.type) nextQuery = nextQuery.eq('type', filters.type);

  if (options.includeStatus !== false && filters.status) {
    if (filters.status === 'active') {
      nextQuery = nextQuery.not('status', 'in', '("deleted","archived")');
    } else {
      nextQuery = nextQuery.eq('status', filters.status);
    }
  }

  if (filters.search) {
    const search = escapePostgrestLikeValue(filters.search.trim());
    if (search) {
      nextQuery = nextQuery.or(
        [`id.ilike.%${search}%`, `type.ilike.%${search}%`, `difficulty_level.ilike.%${search}%`, `source_type.ilike.%${search}%`, `body->>text_bn.ilike.%${search}%`, `body->>text_en.ilike.%${search}%`, `body->>bn.ilike.%${search}%`, `body->>en.ilike.%${search}%`].join(',')
      );
    }
  }

  return nextQuery as T;
};

const getExactCount = async (filters: QuestionBankFilters, options: { includeStatus?: boolean; statusOverride?: string } = {}): Promise<number> => {
  let query = supabase.from('questions').select('id', { count: 'exact', head: true });
  query = applyQuestionBankFilters(query, { ...filters, status: options.statusOverride ?? filters.status }, { includeStatus: options.includeStatus });
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
};

const buildQuestionBankStats = async (filters: QuestionBankFilters, pageData: Record<string, unknown>[], total: number): Promise<QuestionBankStats> => {
  const scopeFiltersWithoutStatus: QuestionBankFilters = { ...filters, status: undefined };

  const statusCounts = await Promise.all(
    STATUS_KEYS.map(async (status) => {
      const count = await getExactCount(scopeFiltersWithoutStatus, { includeStatus: true, statusOverride: status });
      return [status, count] as const;
    })
  );

  const statusStats = statusCounts.reduce((acc, [status, count]) => {
    acc[status] = count;
    return acc;
  }, {} as Record<(typeof STATUS_KEYS)[number], number>);

  let qualityScopeQuery = supabase.from('questions').select('id, explanation, media_id, explanation_media_id, options, type').limit(5000);
  qualityScopeQuery = applyQuestionBankFilters(qualityScopeQuery, filters);
  const { data: qualityRows, error: qualityError } = await qualityScopeQuery;

  if (qualityError) throw new Error(qualityError.message);

  const qualityData = ((qualityRows?.length ? qualityRows : pageData) || []) as Record<string, unknown>[];
  const withExplanation = qualityData.filter(hasExplanation).length;
  const withMedia = qualityData.filter(hasMedia).length;
  const withoutCorrectAnswer = qualityData.filter((question) => !hasCorrectAnswer(question)).length;

  return {
    total,
    published: statusStats.published || 0,
    approved: statusStats.approved || 0,
    pending: statusStats.pending || 0,
    review: statusStats.review || 0,
    draft: statusStats.draft || 0,
    archived: statusStats.archived || 0,
    deleted: statusStats.deleted || 0,
    rejected: statusStats.rejected || 0,
    flagged: statusStats.flagged || 0,
    withExplanation,
    withoutExplanation: Math.max(total - withExplanation, 0),
    withMedia,
    withoutCorrectAnswer,
  };
};

export const createComprehension = async (data: ComprehensionPayload) => {
  const { data: result, error } = await supabase.from('comprehensions').insert(data as TablesInsert<'comprehensions'>).select().single();
  if (error) throw new Error(error.message);
  return result;
};

export const searchComprehensions = async (query: string) => {
  const { data, error } = await supabase.from('comprehensions').select('*').ilike('body', `%${query}%`).limit(20);
  if (error) throw new Error(error.message);
  return data;
};

export const saveSmartQuestion = async (questionData: QuestionPayload) => {
  const content_hash = generateContentHash(questionData as unknown as Record<string, unknown>);
  const payloadToInsert: TablesInsert<'questions'> = {
    ...(questionData as unknown as TablesInsert<'questions'>),
    content_hash,
    status: questionData.status || 'pending',
  };

  const { data, error } = await supabase.from('questions').insert(payloadToInsert).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Duplicate question found.');
    throw new Error(error.message);
  }
  return data;
};

export const updateQuestion = async (id: string, questionData: Partial<QuestionPayload>) => {
  if (questionData.body || questionData.options || questionData.type || questionData.difficulty_level) {
    const { data: existingData } = await supabase.from('questions').select('body, options, type, difficulty_level').eq('id', id).single();
    if (existingData) {
      const mergedData = { ...existingData, ...questionData };
      questionData.content_hash = generateContentHash(mergedData as Record<string, unknown>);
    } else {
      questionData.content_hash = generateContentHash(questionData as Record<string, unknown>);
    }
  }

  const { data, error } = await supabase.from('questions').update(questionData as TablesUpdate<'questions'>).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteQuestion = async (id: string) => {
  const { error } = await supabase.from('questions').update({ is_active: false, status: 'deleted' }).eq('id', id);
  if (error) throw new Error(error.message);
  return true;
};

export const saveBulkQuestions = async (questionsData: Record<string, unknown>[], userId?: string) => {
  try {
    await autoCreateMissingInstitutions(questionsData);
  } catch (error) {
    console.error('Error auto-creating institutions:', error);
  }

  const BATCH_SIZE = 500;
  const allInsertedData: unknown[] = [];
  const flatQuestionsToInsert: TablesInsert<'questions'>[] = [];

  for (const item of questionsData) {
    if (item.type === 'Comprehension') {
      const passageBody = typeof item.passage === 'object' ? JSON.stringify(item.passage) : (item.passage as string);
      const comprehensionPayload: TablesInsert<'comprehensions'> = { body: passageBody };
      const { data: compResult, error: compError } = await supabase.from('comprehensions').insert(comprehensionPayload).select('id').single();

      if (compError) throw new Error(compError.message);

      if (Array.isArray(item.questions)) {
        for (const question of item.questions) {
          flatQuestionsToInsert.push({
            ...question,
            subject_id: question.subject_id || item.subject_id,
            chapter_id: question.chapter_id || item.chapter_id,
            topic_id: question.topic_id || item.topic_id,
            comprehension_id: compResult.id,
            status: question.status || 'pending',
            created_by: userId,
            content_hash: generateContentHash(question as Record<string, unknown>),
          } as TablesInsert<'questions'>);
        }
      }
    } else {
      flatQuestionsToInsert.push({
        ...item,
        status: item.status || 'pending',
        created_by: userId,
        content_hash: generateContentHash(item as Record<string, unknown>),
      } as TablesInsert<'questions'>);
    }
  }

  for (let index = 0; index < flatQuestionsToInsert.length; index += BATCH_SIZE) {
    const chunk = flatQuestionsToInsert.slice(index, index + BATCH_SIZE);
    const { data, error } = await supabase.from('questions').upsert(chunk, { onConflict: 'subject_id, content_hash', ignoreDuplicates: true }).select();
    if (error) throw new Error(error.message);
    if (data) allInsertedData.push(...data);
  }

  return allInsertedData;
};

export const getFilteredQuestions = async (filters: QuestionBankFilters, page: number = 1, limit: number = 20): Promise<QuestionBankResult> => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase.from('questions').select(QUESTION_BANK_SELECT, { count: 'exact' });
  query = applyQuestionBankFilters(query, filters);

  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) throw new Error(error.message);

  const rows = (data || []) as unknown[];
  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const stats = await buildQuestionBankStats(filters, rows as Record<string, unknown>[], total);

  return {
    data: rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages, hasNextPage: safePage < totalPages, hasPreviousPage: safePage > 1 },
    stats,
  };
};

export const hardDeleteQuestion = async (id: string) => {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
};

export const refreshSearchIndex = async (type: 'vector' | 'global'): Promise<boolean> => {
  const rpcFunction = type === 'vector' ? 'refresh_vector_index' : 'refresh_global_index';
  const { error } = await supabase.rpc(rpcFunction);
  if (error) throw new Error(error.message);
  return true;
};
