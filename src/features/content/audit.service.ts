import { supabase } from '../../config/supabase';
import { AuditFilterParams } from './content.types';
import type { TablesUpdate } from '../../types/database.type';

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
