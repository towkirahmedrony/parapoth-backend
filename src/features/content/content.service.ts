import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase';
import { CurriculumNode, QuestionPayload, ComprehensionPayload, NodeType, AuditFilterParams } from './content.types';

export const getSubjects = async () => {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name_en, name_bn, is_premium, slug, description, sequence, is_active, icon_url, curriculum_version, language')
    .order('sequence');

  if (error) throw new Error(error.message);
  return data;
};

export const getChapters = async (subjectId?: string) => {
  let query = supabase
    .from('chapters')
    .select('id, name_en, name_bn, subject_id, is_premium, slug, description, sequence, is_active, curriculum_version, language')
    .order('sequence');

  if (subjectId) query = query.eq('subject_id', subjectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

export const getTopics = async (chapterId?: string) => {
  let query = supabase
    .from('topics')
    .select('id, name_en, name_bn, chapter_id, is_premium, slug, sequence, is_active, curriculum_version, language')
    .order('sequence');

  if (chapterId) query = query.eq('chapter_id', chapterId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

export const buildCurriculumTree = async (): Promise<CurriculumNode[]> => {
  const [subjectsRes, chaptersRes, topicsRes] = await Promise.all([
    supabase.from('subjects').select('*').order('sequence'),
    supabase.from('chapters').select('*').order('sequence'),
    supabase.from('topics').select('*').order('sequence'),
  ]);

  if (subjectsRes.error) throw new Error(subjectsRes.error.message);
  if (chaptersRes.error) throw new Error(chaptersRes.error.message);
  if (topicsRes.error) throw new Error(topicsRes.error.message);

  const subjects = subjectsRes.data ?? [];
  const chapters = chaptersRes.data ?? [];
  const topics = topicsRes.data ?? [];

  const topicsByChapter = topics.reduce((acc: Record<string, any[]>, topic: any) => {
    if (!topic.chapter_id) return acc;
    if (!acc[topic.chapter_id]) acc[topic.chapter_id] = [];
    acc[topic.chapter_id].push({ ...topic, type: 'topic', children: [] });
    return acc;
  }, {});

  const chaptersBySubject = chapters.reduce((acc: Record<string, any[]>, chapter: any) => {
    if (!chapter.subject_id) return acc;
    if (!acc[chapter.subject_id]) acc[chapter.subject_id] = [];
    acc[chapter.subject_id].push({
      ...chapter,
      type: 'chapter',
      children: topicsByChapter[chapter.id] || [],
    });
    return acc;
  }, {});

  return subjects.map((subject: any) => ({
    ...subject,
    type: 'subject',
    children: chaptersBySubject[subject.id] || [],
  }));
};

const pickAllowedFields = (nodeType: NodeType, rawData: Record<string, any> = {}) => {
  const allowedFieldsByType: Record<NodeType, string[]> = {
    subject: [
      'name_en', 'name_bn', 'slug', 'description', 'sequence', 'is_active', 'is_premium', 'icon_url', 'curriculum_version', 'language',
    ],
    chapter: [
      'name_en', 'name_bn', 'slug', 'description', 'sequence', 'is_active', 'is_premium', 'curriculum_version', 'language', 'subject_id',
    ],
    topic: [
      'name_en', 'name_bn', 'slug', 'sequence', 'is_active', 'is_premium', 'curriculum_version', 'language', 'chapter_id', 'total_questions',
    ],
  };

  const allowedFields = allowedFieldsByType[nodeType];
  const cleaned: Record<string, any> = {};

  for (const key of allowedFields) {
    if (rawData[key] !== undefined) {
      cleaned[key] = rawData[key];
    }
  }

  return cleaned;
};

const generateNodeId = (nodeType: NodeType): string => {
  const suffix = randomUUID().replace(/-/g, '').toLowerCase().slice(0, 16);
  if (nodeType === 'subject') return `sub_${suffix}`;
  if (nodeType === 'chapter') return `chap_${suffix}`;
  return `top_${suffix}`;
};

export const manageCurriculumNode = async (
  action: 'insert' | 'update' | 'delete',
  nodeType: NodeType,
  data: any,
  id?: string
) => {
  const table = nodeType === 'subject' ? 'subjects' : nodeType === 'chapter' ? 'chapters' : 'topics';

  if (action === 'delete') {
    if (!id) throw new Error('ID is required for delete action');
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }

  const payload = pickAllowedFields(nodeType, data || {});

  if (action === 'insert') {
    payload.id = generateNodeId(nodeType);
    const { data: result, error } = await supabase.from(table).insert([payload]).select().single();
    if (error) throw new Error(error.message);
    return result;
  }

  if (action === 'update') {
    if (!id) throw new Error('ID is required for update action');
    if (Object.keys(payload).length === 0) throw new Error('No valid fields provided for update');
    const { data: result, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return result;
  }

  throw new Error('Invalid curriculum action');
};

export const createComprehension = async (data: ComprehensionPayload) => {
  const { data: result, error } = await supabase.from('comprehensions').insert([data]).select().single();
  if (error) throw new Error(error.message);
  return result;
};

export const searchComprehensions = async (query: string) => {
  const { data, error } = await supabase
    .from('comprehensions')
    .select('id, body, subject_id, chapter_id, topic_id')
    .ilike('body', `%${query}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  return data;
};

export const saveSmartQuestion = async (questionData: QuestionPayload) => {
  // 100% Duplicate check based on exact JSON body match
  const { data: existing } = await supabase
    .from('questions')
    .select('id')
    .eq('subject_id', questionData.subject_id)
    .contains('body', questionData.body)
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error('100% Duplicate question found. Cannot save.');
  }

  // Set default status to pending if not provided
  questionData.status = questionData.status || 'pending';

  const { data, error } = await supabase.from('questions').insert([questionData]).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateQuestion = async (id: string, questionData: Partial<QuestionPayload>) => {
  const { data, error } = await supabase.from('questions').update(questionData).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteQuestion = async (id: string) => {
  const { error } = await supabase.from('questions').update({ is_active: false, status: 'deleted' }).eq('id', id);
  if (error) throw new Error(error.message);
  return true;
};

export const fetchAiQueue = async () => {
  const { data, error } = await supabase
    .from('questions')
    .select('id, body, tags, confidence_score, status, difficulty_level, type')
    .lt('confidence_score', 70)
    .eq('status', 'review')
    .order('confidence_score', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
};

export const reviewQuestion = async (id: string, status: 'approved' | 'rejected', adminId: string) => {
  const { data, error } = await supabase
    .from('questions')
    .update({ status, approved_by: adminId, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const refreshSearchIndex = async (type: 'vector' | 'global'): Promise<boolean> => {
  const rpcFunction = type === 'vector' ? 'refresh_vector_index' : 'refresh_global_index';
  const { error } = await supabase.rpc(rpcFunction);
  if (error) throw new Error(error.message);
  return true;
};

export const saveBulkQuestions = async (questionsData: any[], userId?: string) => {
  const BATCH_SIZE = 500;
  let allInsertedData: any[] = [];
  let flatQuestionsToInsert: any[] = [];

  for (const item of questionsData) {
    if (item.type === 'Comprehension') {
      const comprehensionPayload = { body: typeof item.passage === 'object' ? JSON.stringify(item.passage) : item.passage };
      const { data: compResult, error: compError } = await supabase.from('comprehensions').insert([comprehensionPayload]).select('id').single();
      if (compError) throw new Error(`Comprehension insert failed: ${compError.message}`);

      if (item.questions && Array.isArray(item.questions)) {
        for (const q of item.questions) {
          // Check for exact duplicate
          const { data: existing } = await supabase
            .from('questions')
            .select('id')
            .eq('subject_id', q.subject_id || item.subject_id)
            .contains('body', q.body)
            .limit(1);

          if (!existing || existing.length === 0) {
            flatQuestionsToInsert.push({ 
              ...q, 
              subject_id: q.subject_id || item.subject_id,
              comprehension_id: compResult.id, 
              status: q.status || 'pending', 
              created_by: userId 
            });
          }
        }
      }
    } else {
      // Check for exact duplicate
      const { data: existing } = await supabase
        .from('questions')
        .select('id')
        .eq('subject_id', item.subject_id)
        .contains('body', item.body)
        .limit(1);

      if (!existing || existing.length === 0) {
        flatQuestionsToInsert.push({ 
          ...item, 
          status: item.status || 'pending', 
          created_by: userId 
        });
      }
    }
  }

  for (let i = 0; i < flatQuestionsToInsert.length; i += BATCH_SIZE) {
    const chunk = flatQuestionsToInsert.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('questions').insert(chunk).select();
    if (error) throw new Error(error.message);
    if (data) allInsertedData.push(...data);
  }
  return allInsertedData;
};

export const getAuditQuestions = async (filters: AuditFilterParams) => {
  let query = supabase.from('questions').select('id, body, options, explanation, confidence_score, difficulty_level, type, status, created_at, subject_id, chapter_id, tags').neq('status', 'deleted').order('created_at', { ascending: false });
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  else query = query.in('status', ['pending', 'review', 'flagged']);
  if (filters.difficulty && filters.difficulty !== 'all') query = query.eq('difficulty_level', filters.difficulty);
  if (filters.subject_id) query = query.eq('subject_id', filters.subject_id);
  if (filters.search) query = query.textSearch('search_vector', filters.search);

  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  return data;
};

export const updateQuestionAuditStatus = async (id: string, status: string, notes: string | undefined, adminId: string) => {
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (status === 'approved') { updateData.approved_by = adminId; updateData.approved_at = new Date().toISOString(); }
    const { data, error } = await supabase.from('questions').update(updateData).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
};

export const getFilteredQuestions = async (filters: any, page: number = 1, limit: number = 20) => {
  let query = supabase
    .from('questions')
    .select('id, body, options, explanation, difficulty_level, type, status, created_at, subject_id, chapter_id, tags, media_id', { count: 'exact' });

  if (filters.subject_id) query = query.eq('subject_id', filters.subject_id);
  if (filters.difficulty) query = query.eq('difficulty_level', filters.difficulty);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  
  if (filters.search) {
    query = query.or(`id.ilike.%${filters.search}%,body->>text_bn.ilike.%${filters.search}%,body->>text_en.ilike.%${filters.search}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    data,
    total: count || 0
  };
};

export const hardDeleteQuestion = async (id: string) => {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
};
