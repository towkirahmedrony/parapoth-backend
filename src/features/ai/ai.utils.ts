export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

const MAX_EXTRACTED_TEXT_LENGTH = 4000;

export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const normalizeText = (value: unknown, maxLength = MAX_EXTRACTED_TEXT_LENGTH): string => {
  if (!isNonEmptyString(value)) return '';

  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
};

export const createSessionTitle = (message: string): string => {
  const cleaned = normalizeText(message, 80);

  if (!cleaned) return 'নতুন AI চ্যাট';

  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}...` : cleaned;
};

export const createHttpError = (message: string, statusCode = 500): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

export const getEnvOrThrow = (key: string): string => {
  const value = process.env[key];

  if (!isNonEmptyString(value)) {
    throw createHttpError(`${key} is not configured`, 500);
  }

  return value;
};

export const extractTextFromJson = (jsonObj: unknown): string => {
  if (jsonObj === null || jsonObj === undefined) return '';

  if (typeof jsonObj === 'string') {
    return normalizeText(jsonObj);
  }

  if (typeof jsonObj === 'number' || typeof jsonObj === 'boolean') {
    return String(jsonObj);
  }

  if (Array.isArray(jsonObj)) {
    return normalizeText(
      jsonObj
        .map(item => extractTextFromJson(item))
        .filter(Boolean)
        .join(' ')
    );
  }

  if (typeof jsonObj !== 'object') return '';

  const record = jsonObj as Record<string, unknown>;

  const prioritizedKeys = [
    'text',
    'question',
    'body',
    'content',
    'explanation',
    'answer',
    'title',
    'description',
  ];

  for (const key of prioritizedKeys) {
    const value = record[key];

    if (isNonEmptyString(value)) {
      return normalizeText(value);
    }

    if (typeof value === 'object' && value !== null) {
      const nested = extractTextFromJson(value);
      if (nested) return nested;
    }
  }

  try {
    return normalizeText(JSON.stringify(jsonObj));
  } catch {
    return '';
  }
};

export const sanitizePromptPart = (value: unknown, maxLength = 6000): string => {
  return normalizeText(value, maxLength);
};
