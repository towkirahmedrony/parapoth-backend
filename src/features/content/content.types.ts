export type NodeType = 'subject' | 'chapter' | 'topic';

export const QUESTION_STATUSES = [
  'draft',
  'review',
  'approved',
  'rejected',
  'published',
  'deleted',
  'flagged',
  'pending',
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const AUDITABLE_STATUSES = ['approved', 'rejected', 'flagged'] as const;
export type AuditableStatus = (typeof AUDITABLE_STATUSES)[number];

export interface CurriculumNode {
  id: string;
  name_en: string;
  name_bn: string;
  type: NodeType;
  sequence: number;
  is_active: boolean;
  is_premium?: boolean;
  slug?: string;
  description?: string | null;
  icon_url?: string | null;
  curriculum_version?: string | null;
  language?: string | null;
  children?: CurriculumNode[];
  subject_id?: string;
  chapter_id?: string;
}

export type QuestionBody = Record<string, unknown>;
export type QuestionOption = Record<string, unknown>;
export type ExamReference = Record<string, unknown>;

export interface QuestionPayload {
  subject_id: string;
  chapter_id?: string;
  topic_id?: string;
  comprehension_id?: string | null;
  type: string;
  difficulty_level: string;
  source_type?: string | null;
  body: QuestionBody;
  options: QuestionOption[];
  explanation?: unknown;
  media_id?: string | null;
  explanation_media_id?: string | null;
  tags?: string[];
  exam_references?: ExamReference[];
  status?: QuestionStatus;
  created_by?: string;
  is_embedding_stale?: boolean;
  confidence_score?: number;
  content_hash?: string;
}

export interface ComprehensionPayload {
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  body: string;
  media_id?: string | null;
}

export interface SyncIndexPayload {
  type: 'vector' | 'global';
}

export interface AuditFilterParams {
  status?: string;
  difficulty?: string;
  subject_id?: string;
  search?: string;
}

export interface QuestionBankFilters {
  subject_id?: string;
  difficulty?: string;
  type?: string;
  status?: string;
  search?: string;
}

export interface BulkComprehensionQuestionInput extends Partial<QuestionPayload> {
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
}

export interface BulkQuestionGroupInput {
  type?: string;
  passage?: string | Record<string, unknown>;
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  questions?: BulkComprehensionQuestionInput[];
}

export type BulkQuestionInput = QuestionPayload | BulkQuestionGroupInput;

export interface AuthenticatedUser {
  id: string;
}
