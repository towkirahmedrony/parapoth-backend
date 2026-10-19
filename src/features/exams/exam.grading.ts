/**
 * Pure grading helpers for exam submissions.
 *
 * These helpers deliberately avoid relying on the runtime type of option ids
 * (numeric or UUID string) and on a single casing for the "correct" flag.
 */

export type GradingOption = Record<string, any>;

const CORRECT_FLAG_KEYS = ['isCorrect', 'is_correct', 'correct', 'answer'] as const;

export const normalizeOptionId = (value: unknown): string => String(value ?? '').trim();

export const isFlagTrue = (value: unknown): boolean => {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  return String(value).trim().toLowerCase() === 'true';
};

export const isOptionCorrect = (option: GradingOption | null | undefined): boolean => {
  if (!option) return false;

  return CORRECT_FLAG_KEYS.some((key) => isFlagTrue(option[key]));
};

export const findOptionById = (
  options: GradingOption[],
  selectedOptionId: unknown
): GradingOption | null => {
  const normalizedSelectedId = normalizeOptionId(selectedOptionId);

  if (!normalizedSelectedId) return null;

  return (
    options.find((option) => normalizeOptionId(option?.id) === normalizedSelectedId) ?? null
  );
};

export const isAnswerCorrect = (
  options: GradingOption[],
  selectedOptionId: unknown
): boolean => {
  return isOptionCorrect(findOptionById(options, selectedOptionId));
};

export const optionDisplayText = (option: GradingOption | null | undefined): string | null => {
  if (!option) return null;

  const candidate =
    option.text_bn ?? option.text_en ?? option.text ?? option.bn ?? option.label ?? null;

  if (candidate === null || candidate === undefined) return null;

  const text = String(candidate).trim();

  return text.length > 0 ? text : null;
};

/**
 * Correct answers and explanations are only disclosed for a real, published
 * exam attempt whose result review window has opened.
 *
 * This gate fails closed: a missing exam id, a missing/malformed publish time,
 * or a publish time in the future all deny disclosure. Practice/arena attempts
 * (which have no exam paper) never expose the answer key.
 */
export const isAnswerDisclosureAllowed = (
  examId: string | null | undefined,
  resultPublishTime: string | null | undefined,
  now: number = Date.now()
): boolean => {
  const normalizedExamId = String(examId ?? '').trim();

  if (!normalizedExamId) return false;

  const normalizedPublishTime = String(resultPublishTime ?? '').trim();

  if (!normalizedPublishTime) return false;

  const publishTime = Date.parse(normalizedPublishTime);

  if (Number.isNaN(publishTime)) return false;

  return now >= publishTime;
};
