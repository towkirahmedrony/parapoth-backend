import { supabase } from '../../config/supabase';
import { CurriculumNode, QuestionPayload, ComprehensionPayload, NodeType } from './content.types';

export const getSubjects = async () => {
  // Added icon_url, curriculum_version, language
  const { data, error } = await supabase.from('subjects').select('id, name_en, name_bn, is_premium, slug, description, sequence, is_active, icon_url, curriculum_version, language').order('sequence');
  if (error) throw new Error(error.message);
  return data;
};

export const getChapters = async (subjectId?: string) => {
  // Added curriculum_version, language
  let query = supabase.from('chapters').select('id, name_en, name_bn, subject_id, is_premium, slug, description, sequence, is_active, curriculum_version, language').order('sequence');
  if (subjectId) query = query.eq('subject_id', subjectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

export const getTopics = async (chapterId?: string) => {
  // Added curriculum_version, language
  let query = supabase.from('topics').select('id, name_en, name_bn, chapter_id, is_premium, slug, sequence, is_active, curriculum_version, language').order('sequence');
  if (chapterId) query = query.eq('chapter_id', chapterId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

export const buildCurriculumTree = async (): Promise<CurriculumNode[]> => {
  const [subjectsRes, chaptersRes, topicsRes] = await Promise.all([
    supabase.from('subjects').select('*').order('sequence'),
    supabase.from('chapters').select('*').order('sequence'),
    supabase.from('topics').select('*').order('sequence')
  ]);

  if (subjectsRes.error) throw new Error(subjectsRes.error.message);
  if (chaptersRes.error) throw new Error(chaptersRes.error.message);
  if (topicsRes.error) throw new Error(topicsRes.error.message);

  const topicsByChapter = topicsRes.data.reduce((acc: any, topic: any) => {
    if (!acc[topic.chapter_id]) acc[topic.chapter_id] = [];
    acc[topic.chapter_id].push({ ...topic, type: 'topic', children: [] });
    return acc;
  }, {});

  const chaptersBySubject = chaptersRes.data.reduce((acc: any, chapter: any) => {
    if (!acc[chapter.subject_id]) acc[chapter.subject_id] = [];
    acc[chapter.subject_id].push({ ...chapter, type: 'chapter', children: topicsByChapter[chapter.id] || [] });
    return acc;
  }, {});

  return subjectsRes.data.map((subject: any) => ({
    ...subject, type: 'subject', children: chaptersBySubject[subject.id] || []
  }));
};

export const manageCurriculumNode = async (action: 'insert' | 'update' | 'delete', nodeType: NodeType, data: any, id?: string) => {
  const table = nodeType === 'subject' ? 'subjects' : nodeType === 'chapter' ? 'chapters' : 'topics';
  
  if (action === 'insert') {
    const { data: result, error } = await supabase.from(table).insert([data]).select().single();
    if (error) throw new Error(error.message);
    return result;
  } else if (action === 'update' && id) {
    const { data: result, error } = await supabase.from(table).update(data).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return result;
  } else if (action === 'delete' && id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }
};

export const createComprehension = async (data: ComprehensionPayload) => {
  const { data: result, error } = await supabase.from('comprehensions').insert([data]).select().single();
  if (error) throw new Error(error.message);
  return result;
};

export const searchComprehensions = async (query: string) => {
  const { data, error } = await supabase.from('comprehensions')
    .select('id, body, subject_id, chapter_id, topic_id')
    .ilike('body', `%${query}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  return data;
};

export const saveSmartQuestion = async (questionData: QuestionPayload) => {
  // NOTE: Currently tags are saved directly to the questions.tags array.
  // Future enhancement: Parse questionData.tags and insert into 'tags_master' & 'question_tags' table.
  
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
  const { data, error } = await supabase.from('questions')
    .select('id, body, tags, confidence_score, status, difficulty_level, type')
    .lt('confidence_score', 70)
    .eq('status', 'review')
    .order('confidence_score', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
};

export const reviewQuestion = async (id: string, status: 'approved' | 'rejected', adminId: string) => {
  const { data, error } = await supabase.from('questions')
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
