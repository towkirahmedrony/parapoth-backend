export const SUPPORTED_LANGUAGES = ['bn', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'bn';

export class LanguageValidationError extends Error {
  status = 400;

  constructor(message = "Language must be either 'bn' or 'en'") {
    super(message);
    this.name = 'LanguageValidationError';
  }
}

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value.trim().toLowerCase());

export const parseLanguage = (value: unknown, fallback: Language = DEFAULT_LANGUAGE): Language => {
  if (value === undefined || value === null || value === '') return fallback;
  if (!isLanguage(value)) throw new LanguageValidationError();
  return String(value).trim().toLowerCase() as Language;
};

/**
 * Existing bilingual tables keep Bengali in the legacy field and English in
 * the new `_en` field. Keep both fields in the payload while making the
 * legacy field the selected-language value for existing clients.
 */
export const localizeRecord = <T extends Record<string, any>>(
  record: T,
  language: Language,
  fields: readonly string[],
): T => {
  if (language === 'bn') return record;
  const localized = { ...record } as Record<string, any>;
  for (const field of fields) {
    const english = localized[`${field}_en`];
    if (english !== null && english !== undefined && english !== '') localized[field] = english;
  }
  return localized as T;
};

export const localizeRecords = <T extends Record<string, any>>(
  records: T[] | null | undefined,
  language: Language,
  fields: readonly string[],
): T[] => (records ?? []).map((record) => localizeRecord(record, language, fields));
