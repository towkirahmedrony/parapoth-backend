/**
 * Helpers for building PostgREST filter fragments from user input.
 *
 * PostgREST `.or(...)` / `.ilike(...)` arguments are a small filter language,
 * so raw input must never be interpolated: a comma or parenthesis starts a new
 * filter, and `%` / `_` are LIKE wildcards. Search input is normalised here
 * once so every feature uses the same rules.
 */

/** Longest accepted user search term. */
export const MAX_SEARCH_LENGTH = 64;

/** Characters that would change the shape of a PostgREST filter. */
const FILTER_SYNTAX_CHARS = /[,()\\]/;

export class SearchInputError extends Error {
  status = 400;
  code = 'VALIDATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'SearchInputError';
  }
}

/**
 * Escapes the LIKE metacharacters so a term is matched literally by `ilike`.
 * `\` is escaped first (it is the escape character itself).
 */
export const escapeLikeValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');

/**
 * Normalises a search term for use inside a PostgREST filter.
 *
 * Returns an empty string for empty input so callers can skip the filter.
 * Throws `SearchInputError` (HTTP 400) for input that cannot be represented
 * safely instead of silently building a different query.
 */
export const normalizeSearchTerm = (raw: unknown, maxLength = MAX_SEARCH_LENGTH): string => {
  if (raw === null || raw === undefined) return '';

  if (typeof raw !== 'string') {
    throw new SearchInputError('Search text must be a string');
  }

  const term = raw.trim().replace(/\s+/g, ' ');

  if (!term) return '';

  if (term.length > maxLength) {
    throw new SearchInputError(`Search text must be at most ${maxLength} characters`);
  }

  // Control characters have no place in a question text search and are a
  // common way to smuggle filter syntax past naive validation.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(term)) {
    throw new SearchInputError('Search text contains unsupported characters');
  }

  if (FILTER_SYNTAX_CHARS.test(term)) {
    throw new SearchInputError('Search text contains unsupported characters');
  }

  return escapeLikeValue(term);
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value.trim());

/**
 * Exact-match clause for an id column.
 *
 * `questions.id` is a UUID, so `id.ilike.%term%` is invalid there. Matching an
 * id exactly (and only when the term actually is a UUID) keeps identifier
 * search working without an unsupported LIKE over a UUID column.
 */
export const buildIdMatchClause = (column: string, term: string): string | null =>
  isUuid(term) ? `${column}.eq.${term}` : null;

/** Joins non-empty filter fragments, dropping the ones the builder rejected. */
export const joinOrClauses = (clauses: Array<string | null | undefined>): string =>
  clauses.filter((clause): clause is string => Boolean(clause)).join(',');
