import { supabase } from '../../config/supabase';

export const getUserExamHistory = async (userId: string) => {
  const { data, error } = await supabase
    .from('exam_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const getUserMistakes = async (userId: string) => {
  const { data, error } = await supabase
    .from('wrong_answers')
    .select('id, selected_option, question_id, questions ( id, body, options, explanation )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const getUserBookmarks = async (userId: string) => {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('id, note, questions ( id, body )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const deleteMistakeRecord = async (mistakeId: string, userId: string) => {
  const { error } = await supabase
    .from('wrong_answers')
    .delete()
    .eq('id', mistakeId)
    .eq('user_id', userId); // Ensure the user owns the record

  if (error) throw error;
  return true;
};

export const deleteBookmarkRecord = async (bookmarkId: string, userId: string) => {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
    .eq('user_id', userId); // Ensure the user owns the record

  if (error) throw error;
  return true;
};
