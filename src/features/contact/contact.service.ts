import axios from 'axios';

export interface ContactFormInput {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown;
  submittedAfterMs?: unknown;
}

export interface ContactRequestMeta {
  ip: string;
  userAgent?: string;
}

export class ContactSubmissionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ContactSubmissionError';
    this.statusCode = statusCode;
  }
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface SanitizedContactPayload {
  name: string;
  email: string;
  message: string;
  submittedAfterMs: number;
  ip: string;
  userAgent?: string;
  source: 'parapoth-contact-form';
  submittedAt: string;
}

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 80;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 1000;
const MIN_SUBMIT_TIME_MS = 2500;

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const GOOGLE_SCRIPT_TIMEOUT_MS = 15000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const rateLimitStore = new Map<string, RateLimitEntry>();
const duplicateStore = new Map<string, number>();

const normalizeString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeEmail = (value: unknown): string => {
  return normalizeString(value).toLowerCase();
};

const getSubmittedAfterMs = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const cleanupStores = () => {
  const now = Date.now();

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  for (const [key, submittedAt] of duplicateStore.entries()) {
    if (now - submittedAt > DUPLICATE_WINDOW_MS) {
      duplicateStore.delete(key);
    }
  }
};

const enforceRateLimit = (ip: string) => {
  cleanupStores();

  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new ContactSubmissionError(
      'Too many messages sent. Please try again later.',
      429
    );
  }

  current.count += 1;
  rateLimitStore.set(ip, current);
};

const enforceDuplicateProtection = (payload: Pick<SanitizedContactPayload, 'ip' | 'email' | 'message'>) => {
  const normalizedMessage = payload.message.toLowerCase().replace(/\s+/g, ' ');
  const duplicateKey = `${payload.ip}:${payload.email}:${normalizedMessage}`;
  const lastSubmittedAt = duplicateStore.get(duplicateKey);
  const now = Date.now();

  if (lastSubmittedAt && now - lastSubmittedAt < DUPLICATE_WINDOW_MS) {
    throw new ContactSubmissionError(
      'This message was already submitted recently.',
      409
    );
  }

  duplicateStore.set(duplicateKey, now);
};

const validateAndSanitizePayload = (
  formData: ContactFormInput,
  meta: ContactRequestMeta
): SanitizedContactPayload => {
  const name = normalizeString(formData.name);
  const email = normalizeEmail(formData.email);
  const message = normalizeString(formData.message);
  const website = normalizeString(formData.website);
  const submittedAfterMs = getSubmittedAfterMs(formData.submittedAfterMs);

  if (website) {
    throw new ContactSubmissionError('Spam detected.', 400);
  }

  if (submittedAfterMs < MIN_SUBMIT_TIME_MS) {
    throw new ContactSubmissionError('Please fill out the form normally and try again.', 400);
  }

  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new ContactSubmissionError(
      `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`,
      400
    );
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new ContactSubmissionError('Please provide a valid email address.', 400);
  }

  if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    throw new ContactSubmissionError(
      `Message must be between ${MIN_MESSAGE_LENGTH} and ${MAX_MESSAGE_LENGTH} characters.`,
      400
    );
  }

  return {
    name,
    email,
    message,
    submittedAfterMs,
    ip: meta.ip,
    userAgent: meta.userAgent,
    source: 'parapoth-contact-form',
    submittedAt: new Date().toISOString(),
  };
};

export const contactService = {
  submitToGoogle: async (formData: ContactFormInput, meta: ContactRequestMeta) => {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL?.trim();

    if (!scriptUrl) {
      throw new ContactSubmissionError('Contact service is not configured.', 500);
    }

    const ip = meta.ip || 'unknown';

    enforceRateLimit(ip);

    const payload = validateAndSanitizePayload(formData, {
      ...meta,
      ip,
    });

    enforceDuplicateProtection({
      ip: payload.ip,
      email: payload.email,
      message: payload.message,
    });

    try {
      const response = await axios.post(scriptUrl, payload, {
        timeout: GOOGLE_SCRIPT_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status >= 200 && status < 300,
      });

      return response.data ?? {
        submitted: true,
      };
    } catch {
      throw new ContactSubmissionError(
        'Contact service is temporarily unavailable. Please try again later.',
        502
      );
    }
  },
};
