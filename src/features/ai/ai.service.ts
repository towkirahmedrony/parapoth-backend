import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../config/supabase';
import {
  createHttpError,
  createSessionTitle,
  getEnvOrThrow,
  isNonEmptyString,
  sanitizePromptPart,
} from './ai.utils';

type ChatRole = 'user' | 'assistant' | 'system';

interface AiConfigRow {
  id?: string;
  system_prompt?: string | null;
  temperature?: number | null;
  is_active?: boolean | null;
}

interface AiConfig {
  system_prompt: string;
  temperature: number;
}

interface SubjectRow {
  id: string;
  name_en: string | null;
  name_bn: string | null;
  is_active?: boolean | null;
}

interface AiChatSessionRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  session_title: string | null;
}

interface ChatWithAiResult {
  reply: string;
  sessionId: string;
}

interface UpdateAiConfigPayload {
  system_prompt?: unknown;
  temperature?: unknown;
}

const MODEL = {
  chat: 'gemini-2.5-flash',
} as const;

const MAX_MESSAGE_LENGTH = 1200;
const MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_SYSTEM_PROMPT =
  'You are ParaSathi AI, a helpful Bengali study tutor for Bangladeshi students. Explain clearly, avoid hallucinations, and tell students to verify important information.';

let genAiClient: GoogleGenerativeAI | null = null;

const getGeminiClient = (): GoogleGenerativeAI => {
  if (!genAiClient) {
    genAiClient = new GoogleGenerativeAI(getEnvOrThrow('GEMINI_API_KEY'));
  }

  return genAiClient;
};

const validateMessage = (message: unknown): string => {
  if (!isNonEmptyString(message)) {
    throw createHttpError('Message is required', 400);
  }

  const cleaned = message.trim();

  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    throw createHttpError(`Message must be within ${MAX_MESSAGE_LENGTH} characters`, 400);
  }

  return cleaned;
};

const validateId = (value: unknown, fieldName: string): string => {
  if (!isNonEmptyString(value)) {
    throw createHttpError(`${fieldName} is required`, 400);
  }

  return value.trim();
};

const normalizeTemperature = (value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.7;
  }

  return Math.min(Math.max(value, 0), 1);
};

export const getAiConfigService = async (): Promise<AiConfig> => {
  const { data, error } = await supabase
    .from('ai_prompts_config')
    .select('id, system_prompt, temperature, is_active')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw createHttpError(error.message, 500);
  }

  const config = data as AiConfigRow | null;

  return {
    system_prompt:
      isNonEmptyString(config?.system_prompt) ? config.system_prompt.trim() : DEFAULT_SYSTEM_PROMPT,
    temperature: normalizeTemperature(config?.temperature),
  };
};

const getSubjectOrThrow = async (subjectId: string): Promise<SubjectRow> => {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name_en, name_bn, is_active')
    .eq('id', subjectId)
    .maybeSingle();

  if (error) {
    throw createHttpError(error.message, 500);
  }

  if (!data) {
    throw createHttpError('Selected subject was not found', 404);
  }

  const subject = data as SubjectRow;

  if (subject.is_active === false) {
    throw createHttpError('Selected subject is not active', 400);
  }

  return subject;
};

const getSessionForUser = async (
  userId: string,
  sessionId: string
): Promise<AiChatSessionRow> => {
  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .select('id, user_id, subject_id, session_title')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    throw createHttpError(error.message, 500);
  }

  if (!data) {
    throw createHttpError('Chat session was not found', 404);
  }

  const session = data as AiChatSessionRow;

  if (session.user_id !== userId) {
    throw createHttpError('You do not have access to this chat session', 403);
  }

  return session;
};

const createChatSession = async (
  userId: string,
  subjectId: string,
  message: string
): Promise<string> => {
  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .insert({
      user_id: userId,
      subject_id: subjectId,
      session_title: createSessionTitle(message),
      last_active_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw createHttpError(error.message, 500);
  }

  const id = (data as { id?: string } | null)?.id;

  if (!id) {
    throw createHttpError('Failed to create AI chat session', 500);
  }

  return id;
};

const getOrCreateSession = async (
  userId: string,
  sessionId: string | null,
  subjectId: string,
  message: string
): Promise<string> => {
  if (!sessionId) {
    return createChatSession(userId, subjectId, message);
  }

  const session = await getSessionForUser(userId, sessionId);

  if (session.subject_id && session.subject_id !== subjectId) {
    throw createHttpError('This chat session belongs to another subject', 400);
  }

  if (!session.subject_id) {
    const { error } = await supabase
      .from('ai_chat_sessions')
      .update({
        subject_id: subjectId,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (error) {
      throw createHttpError(error.message, 500);
    }
  }

  return session.id;
};

const saveMessage = async (
  sessionId: string,
  role: ChatRole,
  content: string,
  promptTokens = 0,
  completionTokens = 0
): Promise<void> => {
  const { error } = await supabase.from('ai_chat_messages').insert({
    session_id: sessionId,
    role,
    content,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });

  if (error) {
    throw createHttpError(error.message, 500);
  }
};

const buildPrompt = (params: {
  config: AiConfig;
  subject: SubjectRow;
  message: string;
}): string => {
  const subjectName = params.subject.name_bn || params.subject.name_en || 'Unknown Subject';

  return `
System Instruction:
${sanitizePromptPart(params.config.system_prompt)}

You are answering a student inside ParaPoth, an exam preparation platform.
Rules:
- Reply mainly in clear Bangla.
- Keep the answer student-friendly and structured.
- If the question is mathematical, use readable steps.
- If you are unsure, say so honestly.
- Do not mention internal IDs, database fields, or implementation details.
- Do not invent board years, references, or facts.

Selected Subject:
${sanitizePromptPart(subjectName, 300)}

Student Question:
${sanitizePromptPart(params.message, MAX_MESSAGE_LENGTH)}

Now answer clearly.
`.trim();
};

export const chatWithAiService = async (
  userId: string,
  sessionId: string | null,
  message: string,
  subjectId: string
): Promise<ChatWithAiResult> => {
  const cleanUserId = validateId(userId, 'User ID');
  const cleanSubjectId = validateId(subjectId, 'Subject ID');
  const cleanMessage = validateMessage(message);

  const [config, subject] = await Promise.all([
    getAiConfigService(),
    getSubjectOrThrow(cleanSubjectId),
  ]);

  const activeSessionId = await getOrCreateSession(
    cleanUserId,
    sessionId,
    cleanSubjectId,
    cleanMessage
  );

  await saveMessage(activeSessionId, 'user', cleanMessage);

  const chatModel = getGeminiClient().getGenerativeModel({
    model: MODEL.chat,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const finalPrompt = buildPrompt({
    config,
    subject,
    message: cleanMessage,
  });

  try {
    const chatResult = await chatModel.generateContent(finalPrompt);
    const aiReply = chatResult.response.text().trim();
    const usage = chatResult.response.usageMetadata;

    if (!aiReply) {
      throw createHttpError('AI returned an empty response', 502);
    }

    await saveMessage(
      activeSessionId,
      'assistant',
      aiReply,
      usage?.promptTokenCount || 0,
      usage?.candidatesTokenCount || 0
    );

    return {
      reply: aiReply,
      sessionId: activeSessionId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed';
    throw createHttpError(message, 502);
  }
};

export const syncVectorEmbeddingsService = async () => {
  return {
    message: 'Embedding sync is currently disabled. Chat history and Gemini generation are active.',
  };
};

export const updateAiConfigService = async (payload: UpdateAiConfigPayload) => {
  const systemPrompt = isNonEmptyString(payload.system_prompt)
    ? payload.system_prompt.trim()
    : DEFAULT_SYSTEM_PROMPT;

  const temperature = normalizeTemperature(payload.temperature);

  const { data: currentConfig, error: fetchError } = await supabase
    .from('ai_prompts_config')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw createHttpError(fetchError.message, 500);
  }

  const currentConfigId = (currentConfig as { id?: string } | null)?.id;

  if (currentConfigId) {
    const { data, error } = await supabase
      .from('ai_prompts_config')
      .update({
        system_prompt: systemPrompt,
        temperature,
      })
      .eq('id', currentConfigId)
      .select('*')
      .single();

    if (error) {
      throw createHttpError(error.message, 500);
    }

    return data;
  }

  const { data, error } = await supabase
    .from('ai_prompts_config')
    .insert({
      system_prompt: systemPrompt,
      temperature,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    throw createHttpError(error.message, 500);
  }

  return data;
};
