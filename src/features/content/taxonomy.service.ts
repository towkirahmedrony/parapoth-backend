import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase';
import { CurriculumNode, NodeType } from './content.types';
import type { TablesInsert, TablesUpdate } from '../../types/database.type';

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

  const topicsByChapter = topics.reduce((acc: Record<string, unknown[]>, topic: Record<string, unknown>) => {
    const chapterId = topic.chapter_id as string;
    if (!chapterId) return acc;
    if (!acc[chapterId]) acc[chapterId] = [];
    acc[chapterId].push({ ...topic, type: 'topic', children: [] });
    return acc;
  }, {});

  const chaptersBySubject = chapters.reduce((acc: Record<string, unknown[]>, chapter: Record<string, unknown>) => {
    const subjectId = chapter.subject_id as string;
    if (!subjectId) return acc;
    if (!acc[subjectId]) acc[subjectId] = [];
    acc[subjectId].push({
      ...chapter,
      type: 'chapter',
      children: topicsByChapter[chapter.id as string] || [],
    });
    return acc;
  }, {});

  return subjects.map((subject: Record<string, unknown>) => ({
    ...subject,
    type: 'subject',
    children: chaptersBySubject[subject.id as string] || [],
  })) as unknown as CurriculumNode[];
};

const pickAllowedFields = <T>(nodeType: NodeType, rawData: Record<string, unknown> = {}): Partial<T> => {
  const allowedFieldsByType: Record<NodeType, string[]> = {
    subject: ['name_en', 'name_bn', 'slug', 'description', 'sequence', 'is_active', 'is_premium', 'icon_url', 'curriculum_version', 'language'],
    chapter: ['name_en', 'name_bn', 'slug', 'description', 'sequence', 'is_active', 'is_premium', 'curriculum_version', 'language', 'subject_id'],
    topic: ['name_en', 'name_bn', 'slug', 'sequence', 'is_active', 'is_premium', 'curriculum_version', 'language', 'chapter_id', 'total_questions'],
  };

  const allowedFields = allowedFieldsByType[nodeType];
  const sanitized: Record<string, unknown> = {};

  for (const key of allowedFields) {
    const value = rawData[key];
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized as Partial<T>;
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
  data: Record<string, unknown>,
  id?: string
) => {
  if (action === 'delete') {
    if (!id) throw new Error('ID is required for delete action');

    if (nodeType === 'subject') {
      const { error } = await supabase.from('subjects').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else if (nodeType === 'chapter') {
      const { error } = await supabase.from('chapters').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('topics').delete().eq('id', id);
      if (error) throw new Error(error.message);
    }

    return true;
  }

  const tableMap = {
    subject: 'subjects',
    chapter: 'chapters',
    topic: 'topics',
  } as const;

  const tableName = tableMap[nodeType];
  const payload = pickAllowedFields<any>(nodeType, data);

  if (action === 'insert') {
    payload.id = generateNodeId(nodeType);

    const { data: result, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return result;
  }

  if (!id || Object.keys(payload).length === 0) throw new Error('Valid ID and fields are required');

  const { data: result, error } = await supabase
    .from(tableName)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result;
};
