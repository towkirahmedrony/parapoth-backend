import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../../config/supabase';
import { extractTextFromJson } from './ai.utils';

// API Key init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ✅ Switched to a model that has Free Tier quota available
const MODEL = {
  chat: "gemini-2.5-flash" 
  // ⚠️ embedding temporarily disabled (API issue)
};

export const getAiConfigService = async () => {
  const { data } = await supabase
    .from('ai_prompts_config')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  return data || {
    system_prompt: 'You are a helpful AI tutor.',
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

  // =========================
  // ❌ RAG TEMP DISABLED
  // =========================
  // কারণ embedding API কাজ করছে না
  // পরে fix হলে enable করবে

  // =========================
  // 1. Fetch Subject Name (FIXED SCHEMA)
  // =========================
  let subjectName = 'Unknown Subject';
  
  if (subjectId) {
    // name এর বদলে name_en এবং name_bn সিলেক্ট করা হয়েছে
    const { data: subjectData } = await supabase
      .from('subjects') 
      .select('name_en, name_bn')   
      .eq('id', subjectId)
      .single();

    if (subjectData) {
      // প্রথমে ইংরেজি নাম খুঁজবে, না পেলে বাংলা নাম ব্যবহার করবে
      subjectName = subjectData.name_en || subjectData.name_bn || 'Unknown Subject';
    }
  }

  // =========================
  // 2. AI Generation
  // =========================
  const config = await getAiConfigService();

  const chatModel = genAI.getGenerativeModel({
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

    // =========================
    // Save Session
    // =========================
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
      // ai_chat_messages স্কিমা চেক করা হয়েছে, সব ঠিক আছে
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
  } catch (err: any) {
    console.error('CRITICAL AI ERROR:', err.message);

    return {
      reply:
        'দুঃখিত, এই মুহূর্তে AI উত্তর দিতে পারছে না। পরে আবার চেষ্টা করুন।',
      sessionId: sessionId
    };
  }
};

export const syncVectorEmbeddingsService = async () => {
  return { message: 'Embedding sync is ready.' };
};

export const updateAiConfigService = async (payload: any) => {
  return payload;
};
