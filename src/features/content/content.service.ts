import { randomUUID, createHash } from 'crypto';
import { supabase } from '../../config/supabase';
import {
  AuditFilterParams,
  ComprehensionPayload,
  CurriculumNode,
  InstitutionPayload,
  NodeType,
  QuestionBankFilters,
  QuestionBankResult,
  QuestionBankStats,
  QuestionPayload,
} from './content.types';

import type { TablesInsert, TablesUpdate } from '../../types/database.type';

const QUESTION_BANK_SELECT = `
  id,
  body,
  options,
  explanation,
  difficulty_level,
  type,
  status,
  created_at,
  updated_at,
  subject_id,
  chapter_id,
  topic_id,
  tags,
  media_id,
  explanation_media_id,
  source_type,
  exam_references,
  is_active,
  confidence_score
`;

const STATUS_KEYS: Array<keyof Pick<
  QuestionBankStats,
  'published' | 'approved' | 'pending' | 'review' | 'draft' | 'archived' | 'deleted' | 'rejected' | 'flagged'
>> = [
  'published',
  'approved',
  'pending',
  'review',
  'draft',
  'archived',
  'deleted',
  'rejected',
  'flagged',
];

const generateContentHash = (questionData: Record<string, unknown>): string => {
  const coreContent = {
    body: questionData.body,
    options: questionData.options,
    type: questionData.type,
    difficulty_level: questionData.difficulty_level,
  };

  return createHash('sha256').update(JSON.stringify(coreContent)).digest('hex');
};

const escapePostgrestLikeValue = (value: string): string => {
  return value.replace(/[%_]/g, '\\$&').replace(/,/g, ' ');
};

const getExplanationText = (value: unknown): string => {
  if (!value) return '';

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;

    if (typeof parsed === 'string') return parsed.trim();

    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      return [
        record.bn,
        record.en,
        record.text_bn,
        record.text_en,
        record.body,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
    }

    return String(parsed).trim();
  } catch {
    return String(value).trim();
  }
};

const hasExplanation = (question: Record<string, unknown>): boolean => {
  return getExplanationText(question.explanation).length > 0;
};

const hasCorrectAnswer = (question: Record<string, unknown>): boolean => {
  if (question.type === 'cq') return true;
  const options = Array.isArray(question.options) ? question.options : [];
  return options.some((option) => Boolean((option as Record<string, unknown>)?.isCorrect));
};

const hasMedia = (question: Record<string, unknown>): boolean => {
  return Boolean(question.media_id || question.explanation_media_id);
};

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
        [
          `id.ilike.%${search}%`,
          `type.ilike.%${search}%`,
          `difficulty_level.ilike.%${search}%`,
          `source_type.ilike.%${search}%`,
          `body->>text_bn.ilike.%${search}%`,
          `body->>text_en.ilike.%${search}%`,
          `body->>bn.ilike.%${search}%`,
          `body->>en.ilike.%${search}%`,
        ].join(',')
      );
    }
  }

  return nextQuery as T;
};

const getExactCount = async (
  filters: QuestionBankFilters,
  options: { includeStatus?: boolean; statusOverride?: string } = {}
): Promise<number> => {
  let query = supabase
    .from('questions')
    .select('id', { count: 'exact', head: true });

  const effectiveFilters: QuestionBankFilters = {
    ...filters,
    status: options.statusOverride ?? filters.status,
  };

  query = applyQuestionBankFilters(query, effectiveFilters, {
    includeStatus: options.includeStatus,
  });

  const { count, error } = await query;

  if (error) throw new Error(error.message);
  return count || 0;
};

const buildQuestionBankStats = async (
  filters: QuestionBankFilters,
  pageData: Record<string, unknown>[],
  total: number
): Promise<QuestionBankStats> => {
  const scopeFiltersWithoutStatus: QuestionBankFilters = {
    ...filters,
    status: undefined,
  };

  const statusCounts = await Promise.all(
    STATUS_KEYS.map(async (status) => {
      const count = await getExactCount(scopeFiltersWithoutStatus, {
        includeStatus: true,
        statusOverride: status,
      });

      return [status, count] as const;
    })
  );

  const statusStats = statusCounts.reduce(
    (acc, [status, count]) => {
      acc[status] = count;
      return acc;
    },
    {} as Record<(typeof STATUS_KEYS)[number], number>
  );

  let qualityScopeQuery = supabase
    .from('questions')
    .select('id, explanation, media_id, explanation_media_id, options, type')
    .limit(5000);

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

  if (nodeType === 'subject') {
    const payload = pickAllowedFields<TablesInsert<'subjects'>>('subject', data);

    if (action === 'insert') {
      payload.id = generateNodeId('subject');

      const { data: result, error } = await supabase
        .from('subjects')
        .insert(payload as TablesInsert<'subjects'>)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return result;
    }

    if (!id || Object.keys(payload).length === 0) throw new Error('Valid ID and fields are required');

    const { data: result, error } = await supabase
      .from('subjects')
      .update(payload as TablesUpdate<'subjects'>)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return result;
  }

  if (nodeType === 'chapter') {
    const payload = pickAllowedFields<TablesInsert<'chapters'>>('chapter', data);

    if (action === 'insert') {
      payload.id = generateNodeId('chapter');

      const { data: result, error } = await supabase
        .from('chapters')
        .insert(payload as TablesInsert<'chapters'>)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return result;
    }

    if (!id || Object.keys(payload).length === 0) throw new Error('Valid ID and fields are required');

    const { data: result, error } = await supabase
      .from('chapters')
      .update(payload as TablesUpdate<'chapters'>)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return result;
  }

  if (nodeType === 'topic') {
    const payload = pickAllowedFields<TablesInsert<'topics'>>('topic', data);

    if (action === 'insert') {
      payload.id = generateNodeId('topic');

      const { data: result, error } = await supabase
        .from('topics')
        .insert(payload as TablesInsert<'topics'>)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return result;
    }

    if (!id || Object.keys(payload).length === 0) throw new Error('Valid ID and fields are required');

    const { data: result, error } = await supabase
      .from('topics')
      .update(payload as TablesUpdate<'topics'>)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return result;
  }

  throw new Error('Invalid curriculum action');
};

export const createComprehension = async (data: ComprehensionPayload) => {
  const { data: result, error } = await supabase
    .from('comprehensions')
    .insert(data as TablesInsert<'comprehensions'>)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result;
};

export const searchComprehensions = async (query: string) => {
  const { data, error } = await supabase
    .from('comprehensions')
    .select('*')
    .ilike('body', `%${query}%`)
    .limit(20);

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

  const { data, error } = await supabase
    .from('questions')
    .insert(payloadToInsert)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Duplicate question found.');
    throw new Error(error.message);
  }

  return data;
};

export const updateQuestion = async (id: string, questionData: Partial<QuestionPayload>) => {
  const { data, error } = await supabase
    .from('questions')
    .update(questionData as TablesUpdate<'questions'>)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteQuestion = async (id: string) => {
  const { error } = await supabase
    .from('questions')
    .update({ is_active: false, status: 'deleted' })
    .eq('id', id);

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
    .update({
      status,
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
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

// --- Smart Institution Name Mapping for English -> Bengali Fallbacks ---
const COMMON_BOARD_NAMES: Record<string, string> = {
  'dhaka': 'ঢাকা বোর্ড', 'dhaka board': 'ঢাকা বোর্ড', 'd.b.': 'ঢাকা বোর্ড',
  'rajshahi': 'রাজশাহী বোর্ড', 'rajshahi board': 'রাজশাহী বোর্ড', 'r.b.': 'রাজশাহী বোর্ড',
  'cumilla': 'কুমিল্লা বোর্ড', 'comilla': 'কুমিল্লা বোর্ড', 'cumilla board': 'কুমিল্লা বোর্ড', 'c.b.': 'কুমিল্লা বোর্ড',
  'jashore': 'যশোর বোর্ড', 'jessore': 'যশোর বোর্ড', 'jashore board': 'যশোর বোর্ড', 'j.b.': 'যশোর বোর্ড',
  'chattogram': 'চট্টগ্রাম বোর্ড', 'chittagong': 'চট্টগ্রাম বোর্ড', 'chattogram board': 'চট্টগ্রাম বোর্ড', 'ctg. b.': 'চট্টগ্রাম বোর্ড',
  'barishal': 'বরিশাল বোর্ড', 'barisal': 'বরিশাল বোর্ড', 'barishal board': 'বরিশাল বোর্ড', 'b.b.': 'বরিশাল বোর্ড',
  'sylhet': 'সিলেট বোর্ড', 'sylhet board': 'সিলেট বোর্ড', 's.b.': 'সিলেট বোর্ড',
  'dinajpur': 'দিনাজপুর বোর্ড', 'dinajpur board': 'দিনাজপুর বোর্ড', 'din. b.': 'দিনাজপুর বোর্ড',
  'mymensingh': 'ময়মনসিংহ বোর্ড', 'mymensingh board': 'ময়মনসিংহ বোর্ড', 'mym. b.': 'ময়মনসিংহ বোর্ড',
  'madrasah': 'মাদ্রাসা বোর্ড', 'madrasah board': 'মাদ্রাসা বোর্ড', 'mad. b.': 'মাদ্রাসা বোর্ড',
  'technical': 'কারিগরি বোর্ড', 'technical board': 'কারিগরি বোর্ড', 'tec. b.': 'কারিগরি বোর্ড', 'bteb': 'কারিগরি বোর্ড'
};

const autoCreateMissingInstitutions = async (questionsData: Record<string, unknown>[]) => {
  const newInstitutionsMap = new Map<string, any>();

  const extractRefs = (dataList: any[]) => {
    for (const item of dataList) {
      if (item.type === 'Comprehension' && Array.isArray(item.questions)) {
        extractRefs(item.questions);
      } else if (Array.isArray(item.exam_references)) {
        for (const ref of item.exam_references) {
          const kind = ref.source_kind;
          const rawName = ref.institution_name || ref.board || ref.name;

          if (kind && rawName && typeof rawName === 'string' && ['board', 'college', 'admission', 'school', 'university'].includes(kind)) {
            const nameStr = rawName.trim();
            const key = `${kind}_${nameStr.toLowerCase()}`;

            if (!newInstitutionsMap.has(key)) {
              // Regex to detect Bengali Characters
              const isBengali = /[\u0980-\u09FF]/.test(nameStr);
              
              // Smart resolution for English Board names to Bengali names
              let resolvedBnName = isBengali ? nameStr : (ref.name_bn || ref.institution_name_bn || ref.board_bn);
              if (!resolvedBnName && !isBengali && kind === 'board') {
                 resolvedBnName = COMMON_BOARD_NAMES[nameStr.toLowerCase()];
              }
              // Ultimate Fallback
              if (!resolvedBnName) resolvedBnName = nameStr; 

              let resolvedEnName = !isBengali ? nameStr : (ref.name_en || ref.institution_name_en || ref.board_en || null);
              
              // Generate standard code safely
              let generatedCode = nameStr.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
              if (!generatedCode || isBengali) {
                generatedCode = `${kind.toUpperCase()}_${Date.now().toString().slice(-6)}`;
              }

              newInstitutionsMap.set(key, {
                name_bn: resolvedBnName,
                name_en: resolvedEnName,
                code: generatedCode,
                aliases: [nameStr],
                type: kind,
              });
            }
          }
        }
      }
    }
  };

  extractRefs(questionsData);

  if (newInstitutionsMap.size === 0) return;

  const { data: existing } = await supabase
    .from('institutions' as any)
    .select('name_bn, short_name, name_en, code, aliases');

  const existingKeys = new Set(
    existing?.flatMap((item: any) => [
      item.name_bn?.toLowerCase(),
      item.name_en?.toLowerCase(),
      item.short_name?.toLowerCase(),
      item.code?.toLowerCase(),
      ...(item.aliases || []).map((a: string) => a.toLowerCase())
    ]).filter(Boolean) || []
  );

  const toInsert = Array.from(newInstitutionsMap.values()).filter(
    (institution) => {
      const nameBnLow = institution.name_bn?.toLowerCase();
      const nameEnLow = institution.name_en?.toLowerCase();
      const codeLow = institution.code?.toLowerCase();
      
      return !(
        (nameBnLow && existingKeys.has(nameBnLow)) ||
        (nameEnLow && existingKeys.has(nameEnLow)) ||
        (codeLow && existingKeys.has(codeLow))
      );
    }
  );

  if (toInsert.length > 0) {
    await supabase.from('institutions' as any).insert(toInsert);
  }
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
      const passageBody =
        typeof item.passage === 'object'
          ? JSON.stringify(item.passage)
          : (item.passage as string);

      const comprehensionPayload: TablesInsert<'comprehensions'> = {
        body: passageBody,
      };

      const { data: compResult, error: compError } = await supabase
        .from('comprehensions')
        .insert(comprehensionPayload)
        .select('id')
        .single();

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

    const { data, error } = await supabase
      .from('questions')
      .upsert(chunk, {
        onConflict: 'subject_id, content_hash',
        ignoreDuplicates: true,
      })
      .select();

    if (error) throw new Error(error.message);
    if (data) allInsertedData.push(...data);
  }

  return allInsertedData;
};

export const getAuditQuestions = async (filters: AuditFilterParams) => {
  let query = supabase
    .from('questions')
    .select('id, body, options, explanation, confidence_score, difficulty_level, type, status, created_at, subject_id, chapter_id, topic_id, tags')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  } else {
    query = query.in('status', ['pending', 'review', 'flagged']);
  }

  if (filters.difficulty && filters.difficulty !== 'all') {
    query = query.eq('difficulty_level', filters.difficulty);
  }

  if (filters.subject_id) query = query.eq('subject_id', filters.subject_id);
  if (filters.search) query = query.textSearch('search_vector', filters.search);

  const { data, error } = await query.limit(100);

  if (error) throw new Error(error.message);
  return data;
};

export const updateQuestionAuditStatus = async (
  id: string,
  status: string,
  notes: string | undefined,
  adminId: string
) => {
  const updateData: TablesUpdate<'questions'> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (notes) {
    (updateData as Record<string, unknown>).audit_notes = notes;
  }

  if (status === 'approved') {
    updateData.approved_by = adminId;
    updateData.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('questions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const getFilteredQuestions = async (
  filters: QuestionBankFilters,
  page: number = 1,
  limit: number = 20
): Promise<QuestionBankResult> => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase
    .from('questions')
    .select(QUESTION_BANK_SELECT, { count: 'exact' });

  query = applyQuestionBankFilters(query, filters);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const rows = (data || []) as unknown[];
  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  const stats = await buildQuestionBankStats(
    filters,
    rows as Record<string, unknown>[],
    total
  );

  return {
    data: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
    stats,
  };
};

export const hardDeleteQuestion = async (id: string) => {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return true;
};

export const getInstitutions = async () => {
  const { data, error } = await supabase
    .from('institutions' as any)
    .select('*')
    .order('name_bn', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
};

export const createInstitution = async (payload: Partial<InstitutionPayload>) => {
  const { data, error } = await supabase
    .from('institutions' as any)
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const updateInstitution = async (id: string, payload: Partial<InstitutionPayload>) => {
  const { data, error } = await supabase
    .from('institutions' as any)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteInstitution = async (id: string) => {
  const { error } = await supabase
    .from('institutions' as any)
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return true;
};
