export type NodeType = 'subject' | 'chapter' | 'topic';

export interface CurriculumNode {
  id: string;
  name_en: string;
  name_bn: string;
  type: NodeType;
  sequence: number;
  is_active: boolean;
  is_premium?: boolean;
  slug?: string;
  description?: string;
  icon_url?: string | null;
  curriculum_version?: string | null;
  language?: string | null;
  children?: CurriculumNode[];
  subject_id?: string;
  chapter_id?: string;
}

export interface QuestionPayload {
  subject_id: string;
  chapter_id?: string;
  topic_id?: string;
  comprehension_id?: string | null;
  type: string;
  difficulty_level: string;
  source_type?: string | null;
  body: Record<string, any>; // This contains text and nested video object
  options: Record<string, any>[];
  explanation?: string;
  media_id?: string | null;
  explanation_media_id?: string | null;
  tags?: string[];
  exam_references?: Record<string, any>[];
  status: 'draft' | 'review' | 'approved' | 'rejected' | 'published' | 'deleted';
  created_by?: string;
  is_embedding_stale?: boolean;
}

export interface ComprehensionPayload {
  subject_id?: string;
  chapter_id?: string;
  topic_id?: string;
  body: string;
  media_id?: string;
}

export interface SyncIndexPayload {
  type: 'vector' | 'global';
}
