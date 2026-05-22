/**
 * AI 클라이언트 모듈
 *
 * 역할: Gemini 2.5 Flash로 화면 스크린샷을 분석하고 마스코트 한마디를 생성한다.
 *       Gemini가 rate-limit / 서버 과부하 / 인증 오류로 실패하면
 *       Groq Llama 4 Scout (vision)로 자동 폴백한다.
 */

const { GoogleGenAI } = require('@google/genai');

/** @type {GoogleGenAI|null} Gemini 클라이언트 */
let genAI = null;

/** @type {string|null} Groq API 키 */
let groqApiKey = null;

/** API 호출 카운터 — 모델별 / 일일·시간당 한도 관리 */
const usageCounter = {
  gemini: { daily: 0, hourly: 0, lastDailyReset: Date.now(), lastHourlyReset: Date.now() },
  groq: { daily: 0, hourly: 0, lastDailyReset: Date.now(), lastHourlyReset: Date.now() },
};

/**
 * AI 클라이언트를 초기화한다.
 * @param {string} geminiKey - Gemini API 키 (필수)
 * @param {string} [groqKey] - Groq API 키 (선택, 폴백용)
 * @returns {boolean} Gemini 초기화 성공 여부
 */
function initAIClient(geminiKey, groqKey) {
  groqApiKey = (groqKey && groqKey.trim()) || null;
  if (groqApiKey) console.log('[AI] Groq 폴백 활성화');

  if (!geminiKey || geminiKey.trim() === '') {
    console.error('[AI] Gemini API 키가 설정되지 않았습니다.');
    return false;
  }
  try {
    genAI = new GoogleGenAI({ apiKey: geminiKey.trim() });
    console.log('[AI] Gemini 클라이언트 초기화 완료');
    return true;
  } catch (err) {
    console.error('[AI] Gemini 초기화 실패:', err.message);
    return false;
  }
}

/**
 * 사용량 한도를 확인하고 만료된 구간을 리셋한다.
 * @param {'gemini'|'groq'} provider
 * @param {{ dailyLimit: number, hourlyLimit: number }} limits
 * @returns {boolean} 호출 가능 여부
 */
function checkUsageLimit(provider, limits) {
  const c = usageCounter[provider];
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  if (now - c.lastHourlyReset >= ONE_HOUR) {
    c.hourly = 0;
    c.lastHourlyReset = now;
  }
  if (now - c.lastDailyReset >= ONE_DAY) {
    c.daily = 0;
    c.lastDailyReset = now;
  }

  if (c.daily >= limits.dailyLimit) {
    console.warn(`[AI:${provider}] 일일 한도 초과:`, c.daily);
    return false;
  }
  if (c.hourly >= limits.hourlyLimit) {
    console.warn(`[AI:${provider}] 시간당 한도 초과:`, c.hourly);
    return false;
  }
  return true;
}

function incrementUsage(provider) {
  usageCounter[provider].daily++;
  usageCounter[provider].hourly++;
}

/**
 * Gemini 응답 객체에서 텍스트를 추출한다.
 * @param {object} response
 * @returns {string}
 */
function extractGeminiText(response) {
  try {
    const candidate = response?.candidates?.[0];
    if (candidate) {
      const parts = candidate?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.text && typeof part.text === 'string') return part.text.trim();
        }
      }
      if (candidate.text && typeof candidate.text === 'string') return candidate.text.trim();
    }
    try {
      const t = response?.text;
      if (t && typeof t === 'string') return t.trim();
    } catch (_) { /* getter throw 가능 */ }
    if (typeof response?.text === 'function') return response.text().trim();
  } catch (err) {
    console.error('[AI] Gemini 텍스트 추출 오류:', err.message);
  }
  return '';
}

function buildGeminiContents(systemPrompt, userPrompt, base64Image) {
  return [{
    role: 'user',
    parts: [
      { text: systemPrompt + '\n\n' + userPrompt },
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
    ],
  }];
}

/**
 * Gemini를 호출한다.
 * @returns {Promise<{ok: boolean, text?: string, errorType?: string, errorMsg?: string}>}
 */
async function callGemini(base64Image, options) {
  if (!genAI) return { ok: false, errorType: 'not_initialized', errorMsg: 'no client' };

  const requestConfig = {
    model: options.model,
    config: { maxOutputTokens: options.maxTokens, temperature: options.temperature },
    contents: buildGeminiContents(options.systemPrompt, options.userPrompt, base64Image),
  };

  try {
    const response = await genAI.models.generateContent(requestConfig);
    incrementUsage('gemini');
    const text = extractGeminiText(response);
    if (!text) return { ok: false, errorType: 'empty' };
    console.log(`[AI:gemini] 응답 (${usageCounter.gemini.daily}/${options.limits.dailyLimit}): ${text}`);
    return { ok: true, text };
  } catch (err) {
    const errMsg = err.message || JSON.stringify(err);
    console.error('[AI:gemini] 오류:', errMsg);

    if (err.status === 503 || errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
      // 503: 3초 후 1회 자체 재시도
      console.log('[AI:gemini] 503 — 3초 후 재시도...');
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const retry = await genAI.models.generateContent(requestConfig);
        const retryText = extractGeminiText(retry);
        if (retryText) {
          incrementUsage('gemini');
          console.log('[AI:gemini] 재시도 성공:', retryText);
          return { ok: true, text: retryText };
        }
      } catch (retryErr) {
        console.error('[AI:gemini] 재시도 실패:', retryErr.message);
      }
      return { ok: false, errorType: 'unavailable', errorMsg };
    }
    if (err.status === 429 || errMsg.includes('429')) {
      return { ok: false, errorType: 'rate_limit', errorMsg };
    }
    if (err.status === 403 || errMsg.includes('API key')) {
      return { ok: false, errorType: 'auth_error', errorMsg };
    }
    if (isNetworkError(errMsg)) {
      return { ok: false, errorType: 'network', errorMsg };
    }
    return { ok: false, errorType: 'error', errorMsg };
  }
}

/**
 * 네트워크 단절성 오류인지 메시지로 판별한다.
 * @param {string} msg
 * @returns {boolean}
 */
function isNetworkError(msg) {
  if (!msg) return false;
  return /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|fetch failed|network/i.test(msg);
}

/**
 * Groq Llama 4 Scout (vision)를 호출한다. OpenAI 호환 chat completion 포맷.
 * @returns {Promise<{ok: boolean, text?: string, errorType?: string, errorMsg?: string}>}
 */
async function callGroq(base64Image, options) {
  if (!groqApiKey) return { ok: false, errorType: 'no_groq_key' };

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = {
    model: options.fallbackModel || 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: options.systemPrompt + '\n\n' + options.userPrompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
      ],
    }],
    max_tokens: options.maxTokens,
    temperature: options.temperature,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[AI:groq] HTTP ${res.status}:`, errText.slice(0, 200));
      if (res.status === 429) return { ok: false, errorType: 'rate_limit', errorMsg: errText };
      if (res.status === 401 || res.status === 403) return { ok: false, errorType: 'auth_error', errorMsg: errText };
      return { ok: false, errorType: 'error', errorMsg: errText };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, errorType: 'empty' };

    incrementUsage('groq');
    console.log(`[AI:groq] 응답 (${usageCounter.groq.daily}): ${text}`);
    return { ok: true, text };
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[AI:groq] 호출 오류:', msg);
    if (isNetworkError(msg)) return { ok: false, errorType: 'network', errorMsg: msg };
    return { ok: false, errorType: 'error', errorMsg: msg };
  }
}

/** 폴백을 시도할 만한 Gemini 에러 타입 (network는 어차피 Groq도 안 됨) */
const FALLBACK_TRIGGERS = new Set(['rate_limit', 'unavailable', 'auth_error', 'error', 'empty']);

/**
 * 스크린샷을 분석하여 마스코트 반응을 생성한다.
 * Gemini → (실패) → Groq 순으로 시도.
 *
 * @param {string} base64Image
 * @param {object} options
 * @returns {Promise<{text: string, source: string}>}
 */
async function analyzeScreenshot(base64Image, options = {}) {
  const {
    model = 'gemini-2.5-flash',
    fallbackModel = 'meta-llama/llama-4-scout-17b-16e-instruct',
    systemPrompt = '',
    userPrompt = '',
    maxTokens = 400,
    temperature = 0.8,
    limits = { dailyLimit: 240, hourlyLimit: 60 },
  } = options;

  const callOpts = { model, fallbackModel, systemPrompt, userPrompt, maxTokens, temperature, limits };

  // Gemini 한도 체크
  const geminiAvailable = genAI && checkUsageLimit('gemini', limits);

  if (geminiAvailable) {
    const result = await callGemini(base64Image, callOpts);
    if (result.ok) return { text: result.text, source: 'gemini' };

    // 폴백 시도 (Groq 키가 있고, 폴백 가능한 에러일 때)
    if (groqApiKey && FALLBACK_TRIGGERS.has(result.errorType)) {
      console.log(`[AI] Gemini 실패 (${result.errorType}) — Groq 폴백 시도`);
      if (checkUsageLimit('groq', limits)) {
        const fb = await callGroq(base64Image, callOpts);
        if (fb.ok) return { text: fb.text, source: 'groq' };
        console.warn('[AI] Groq 폴백도 실패:', fb.errorType);
      }
    }

    // 둘 다 실패: 에러 타입별 사용자 메시지
    return errorMessageForType(result.errorType);
  }

  // Gemini 사용 불가 (한도 초과 또는 미초기화) — Groq만 시도
  if (!genAI) {
    return { text: '아직 준비 중이야... API 키를 확인해줘!', source: 'error' };
  }
  if (groqApiKey && checkUsageLimit('groq', limits)) {
    console.log('[AI] Gemini 한도 초과 — Groq로 직접 호출');
    const fb = await callGroq(base64Image, callOpts);
    if (fb.ok) return { text: fb.text, source: 'groq' };
  }
  return { text: '오늘은 너무 많이 떠들었나봐~ 잠시 쉴게!', source: 'limit' };
}

function errorMessageForType(type) {
  switch (type) {
    case 'rate_limit':
      return { text: '지금은 좀 바빠... 잠시 후에 다시 볼게!', source: 'rate_limit' };
    case 'auth_error':
      return { text: 'API 키가 이상해... 설정을 확인해줘!', source: 'auth_error' };
    case 'unavailable':
      return { text: '서버가 바빠서 잠시 쉴게~', source: 'unavailable' };
    case 'empty':
      return { text: '음... 뭐라고 해야 할지 모르겠어!', source: 'empty' };
    case 'network':
      return { text: '인터넷이 안 되나봐... 잠시 후에 다시!', source: 'network' };
    default:
      return { text: '앗, 뭔가 문제가 생겼어! 다시 해볼게~', source: 'error' };
  }
}

/**
 * 현재 API 사용량 통계를 반환한다.
 * @returns {{ gemini: {daily,hourly}, groq: {daily,hourly} }}
 */
function getUsageStats() {
  return {
    gemini: { daily: usageCounter.gemini.daily, hourly: usageCounter.gemini.hourly },
    groq: { daily: usageCounter.groq.daily, hourly: usageCounter.groq.hourly },
  };
}

module.exports = { initAIClient, analyzeScreenshot, getUsageStats };
