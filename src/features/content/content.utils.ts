import { createHash } from 'crypto';
import stringify from 'fast-json-stable-stringify';

export const generateContentHash = (questionData: Record<string, unknown>): string => {
  const coreContent = {
    body: questionData.body,
    options: questionData.options,
    type: questionData.type,
    difficulty_level: questionData.difficulty_level,
  };

  return createHash('sha256').update(stringify(coreContent)).digest('hex');
};

export const escapePostgrestLikeValue = (value: string): string => {
  return value.replace(/[%_]/g, '\\$&').replace(/,/g, ' ');
};

export const getExplanationText = (value: unknown): string => {
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

export const hasExplanation = (question: Record<string, unknown>): boolean => {
  return getExplanationText(question.explanation).length > 0;
};

export const hasCorrectAnswer = (question: Record<string, unknown>): boolean => {
  if (question.type === 'cq') return true;
  const options = Array.isArray(question.options) ? question.options : [];
  return options.some((option) => Boolean((option as Record<string, unknown>)?.isCorrect));
};

export const hasMedia = (question: Record<string, unknown>): boolean => {
  return Boolean(question.media_id || question.explanation_media_id);
};
