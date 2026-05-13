import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../config/supabase';
import { extractTextFromJson } from './ai.utils';
import logger from '../../lib/utils/logger';

// Missing Utils implemented locally
const isNonEmptyString = (text: any): text is string => typeof text === 'string' && text.trim().length > 0;
const createHttpError = (message: string, statusCode: number) => new Error(`[HTTP ${statusCode}]: ${message}`);
const getEnvOrThrow = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

const MODEL = {
  chat: 'gemini-2.5-flash',
  embedding: 'text-embedding-004',
} as const;

const MAX_MESSAGE_LENGTH = 1200;
const MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_SYSTEM_PROMPT =
  'You are ParaSathi AI, a helpful Bengali study tutor for Bangladeshi students. Explain clearly, avoid hallucinations, and tell students to verify important information.';

let genAiClient: GoogleGenerativeAI | null = null;
let embeddingGenAiClient: GoogleGenerativeAI | null = null;

const getGeminiClient = (): GoogleGenerativeAI => {
  if (!genAiClient) {
    genAiClient = new GoogleGenerativeAI(getEnvOrThrow('GEMINI_API_KEY'));
  }
  return genAiClient;
};

const getEmbeddingGeminiClient = (): GoogleGenerativeAI => {
  if (!embeddingGenAiClient) {
    const apiKey = process.env.GEMINI_EMBEDDING_API_KEY || getEnvOrThrow('GEMINI_API_KEY');
    embeddingGenAiClient = new GoogleGenerativeAI(apiKey);
  }
  return embeddingGenAiClient;
};

export interface AiConfig {
  system_prompt: string;
  temperature: number;
}

export const getAiConfigService = async (): Promise<AiConfig> => {
  const { data, error } = await supabase
    .from('ai_prompts_config')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error('Error fetching AI config:', error);
  }

  return data || {
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.7
  };
};

export const chatWithAiService = async (
  userId: string,
  sessionId: string | null,
  message: string,
  subjectId: string
) => {
  let context = '';
  let subjectName = 'Unknown Subject';
  
  if (subjectId) {
    const { data: subjectData } = await supabase
      .from('subjects') 
      .select('name_en, name_bn')   
      .eq('id', subjectId)
      .single();

    if (subjectData) {
      subjectName = subjectData.name_en || subjectData.name_bn || 'Unknown Subject';
    }
  }

  const config = await getAiConfigService();

  const chatModel = getGeminiClient().getGenerativeModel({
    model: MODEL.chat,
    generationConfig: {
      temperature: config.temperature || 0.7
    }
  });

  const finalPrompt = `
System Instruction:
${config.system_prompt}
You must not mention any IDs to the user. Talk naturally.

Subject: ${subjectName}

Database Context:
${context || 'No database context available.'}

Student Question:
${message}

Answer clearly with explanation.
`;

  try {
    const chatResult = await chatModel.generateContent(finalPrompt);
    const aiReply = chatResult.response.text();
    const usage = chatResult.response.usageMetadata;

    let activeSessionId = sessionId;

    if (!activeSessionId) {
      const { data: newSession } = await supabase
        .from('ai_chat_sessions')
        .insert({
          user_id: userId,
          session_title: message.substring(0, 30)
        })
        .select('id')
        .single();

      if (newSession) activeSessionId = newSession.id;
    }

    if (activeSessionId) {
      await supabase.from('ai_chat_messages').insert([
        {
          session_id: activeSessionId,
          content: message,
          role: 'user'
        },
        {
          session_id: activeSessionId,
          content: aiReply,
          role: 'assistant',
          prompt_tokens: usage?.promptTokenCount || 0,
          completion_tokens: usage?.candidatesTokenCount || 0
        }
      ]);
    }

    return {
      reply: aiReply,
      sessionId: activeSessionId
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error(`CRITICAL AI ERROR: ${error.message}`);

    return {
      reply: 'দুঃখিত, এই মুহূর্তে AI উত্তর দিতে পারছে না। পরে আবার চেষ্টা করুন।',
      sessionId: sessionId
    };
  }
};

export const generateVectorEmbedding = async (text: string): Promise<number[]> => {
  if (!isNonEmptyString(text)) {
    throw createHttpError('Text is required to generate embedding', 400);
  }

  try {
    const embeddingClient = getEmbeddingGeminiClient();
    const embeddingModel = embeddingClient.getGenerativeModel({ model: MODEL.embedding });
    
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate vector embedding';
    throw createHttpError(message, 502);
  }
};

export const syncVectorEmbeddingsService = async () => {
  return { message: 'Embedding sync is ready.' };
};

export const updateAiConfigService = async (payload: Record<string, unknown>) => {
  return payload;
};
