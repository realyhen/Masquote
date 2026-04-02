/**
 * AI 클라이언트 모듈
 *
 * 역할: Gemini 2.5 Flash API를 호출하여 화면 스크린샷을 분석하고
 *       마스코트의 한마디 반응을 생성한다.
 *       Phase 5에서 Groq 폴백이 추가된다.
 */

const { GoogleGenAI } = require('@google/genai');

/** @type {GoogleGenAI|null} Gemini AI 클라이언트 인스턴스 */
let genAI = null;

/** API 호출 카운터 (일일/시간당 한도 관리) */
const usageCounter = {
  daily: 0,
  hourly: 0,
  lastDailyReset: Date.now(),
  lastHourlyReset: Date.now(),
};

/**
 * AI 클라이언트를 초기화한다.
 * .env에서 로드된 API 키로 Gemini 클라이언트를 생성한다.
 *
 * @param {string} apiKey - Gemini API 키
 * @returns {boolean} 초기화 성공 여부
 */
function initAIClient(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    console.error('[AI] Gemini API 키가 설정되지 않았습니다.');
    return false;
  }

  try {
    genAI = new GoogleGenAI({ apiKey: apiKey.trim() });
    console.log('[AI] Gemini 클라이언트 초기화 완료');
    return true;
  } catch (err) {
    console.error('[AI] Gemini 클라이언트 초기화 실패:', err.message);
    return false;
  }
}

/**
 * 사용량 카운터를 갱신하고 한도 초과 여부를 확인한다.
 *
 * @param {object} limits - 한도 설정
 * @param {number} limits.dailyLimit - 일일 최대 호출 수
 * @param {number} limits.hourlyLimit - 시간당 최대 호출 수
 * @returns {boolean} 호출 가능 여부 (true면 허용)
 */
function checkAndUpdateUsage(limits) {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  // 시간당 카운터 리셋
  if (now - usageCounter.lastHourlyReset >= ONE_HOUR) {
    usageCounter.hourly = 0;
    usageCounter.lastHourlyReset = now;
  }

  // 일일 카운터 리셋
  if (now - usageCounter.lastDailyReset >= ONE_DAY) {
    usageCounter.daily = 0;
    usageCounter.lastDailyReset = now;
  }

  if (usageCounter.daily >= limits.dailyLimit) {
    console.warn('[AI] 일일 API 한도 초과:', usageCounter.daily);
    return false;
  }

  if (usageCounter.hourly >= limits.hourlyLimit) {
    console.warn('[AI] 시간당 API 한도 초과:', usageCounter.hourly);
    return false;
  }

  return true;
}

/**
 * Gemini 응답 객체에서 텍스트를 추출한다.
 * SDK 버전에 따라 응답 구조가 다를 수 있으므로 여러 경로를 시도한다.
 *
 * @param {object} response - Gemini API 응답 객체
 * @returns {string} 추출된 텍스트 (실패 시 빈 문자열)
 */
function extractText(response) {
  try {
    // 후보 텍스트를 candidates에서 재귀적으로 탐색
    const candidate = response?.candidates?.[0];
    if (candidate) {
      // 경로 A: candidate.content.parts[].text
      const parts = candidate?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.text && typeof part.text === 'string') {
            return part.text.trim();
          }
        }
      }
      // 경로 B: candidate.text (일부 SDK)
      if (candidate.text && typeof candidate.text === 'string') {
        return candidate.text.trim();
      }
    }

    // 경로 C: response.text (getter)
    try {
      const t = response?.text;
      if (t && typeof t === 'string') return t.trim();
    } catch (_) { /* getter가 throw할 수 있음 */ }

    // 경로 D: response.text() (메서드)
    if (typeof response?.text === 'function') {
      return response.text().trim();
    }
  } catch (err) {
    console.error('[AI] 텍스트 추출 오류:', err.message);
  }
  return '';
}

/**
 * Gemini API 호출용 contents 배열을 생성한다.
 */
function buildContents(systemPrompt, userPrompt, base64Image) {
  return [
    {
      role: 'user',
      parts: [
        { text: systemPrompt + '\n\n' + userPrompt },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ],
    },
  ];
}

/**
 * 스크린샷을 Gemini에 보내 마스코트 반응을 생성한다.
 *
 * @param {string} base64Image - JPEG 이미지의 base64 인코딩 문자열
 * @param {object} options - 분석 옵션
 * @param {string} options.model - 사용할 모델명
 * @param {string} options.systemPrompt - 시스템 프롬프트
 * @param {string} options.userPrompt - 유저 메시지 (컨텍스트 포함)
 * @param {number} options.maxTokens - 최대 토큰 수
 * @param {number} options.temperature - 생성 온도
 * @param {object} options.limits - API 한도 설정
 * @returns {Promise<{text: string, source: string}>} AI 응답 텍스트와 소스
 */
async function analyzeScreenshot(base64Image, options = {}) {
  const {
    model = 'gemini-2.5-flash',
    systemPrompt = '',
    userPrompt = '',
    maxTokens = 400,
    temperature = 0.8,
    limits = { dailyLimit: 240, hourlyLimit: 60 },
  } = options;

  // 클라이언트 초기화 확인
  if (!genAI) {
    return { text: '아직 준비 중이야... API 키를 확인해줘!', source: 'error' };
  }

  // 사용량 한도 확인
  if (!checkAndUpdateUsage(limits)) {
    return { text: '오늘은 너무 많이 떠들었나봐~ 잠시 쉴게!', source: 'limit' };
  }

  const requestConfig = {
    model,
    config: { maxOutputTokens: maxTokens, temperature },
    contents: buildContents(systemPrompt, userPrompt, base64Image),
  };

  try {
    const response = await genAI.models.generateContent(requestConfig);

    // 카운터 증가
    usageCounter.daily++;
    usageCounter.hourly++;

    const text = extractText(response);
    if (!text) {
      console.warn('[AI] 텍스트 추출 실패');
      return { text: '음... 뭐라고 해야 할지 모르겠어!', source: 'empty' };
    }

    console.log(`[AI] Gemini 응답 (${usageCounter.daily}/${limits.dailyLimit}): ${text}`);
    return { text, source: 'gemini' };
  } catch (err) {
    const errMsg = err.message || JSON.stringify(err);
    console.error('[AI] Gemini API 오류:', errMsg);

    // 503 서버 과부하 — 3초 후 1회 재시도
    if (err.status === 503 || errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
      console.log('[AI] 503 과부하 — 3초 후 재시도...');
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const retry = await genAI.models.generateContent(requestConfig);
        const retryText = extractText(retry);
        if (retryText) {
          usageCounter.daily++;
          usageCounter.hourly++;
          console.log('[AI] 재시도 성공:', retryText);
          return { text: retryText, source: 'gemini' };
        }
      } catch (retryErr) {
        console.error('[AI] 재시도도 실패:', retryErr.message);
      }
      return { text: '서버가 바빠서 잠시 쉴게~', source: 'unavailable' };
    }

    // 429 Rate Limit
    if (err.status === 429 || errMsg.includes('429')) {
      return { text: '지금은 좀 바빠... 잠시 후에 다시 볼게!', source: 'rate_limit' };
    }

    // 403 인증 오류
    if (err.status === 403 || errMsg.includes('API key')) {
      return { text: 'API 키가 이상해... 설정을 확인해줘!', source: 'auth_error' };
    }

    return { text: '앗, 뭔가 문제가 생겼어! 다시 해볼게~', source: 'error' };
  }
}

/**
 * 현재 API 사용량 통계를 반환한다.
 *
 * @returns {{ daily: number, hourly: number }} 현재 사용량
 */
function getUsageStats() {
  return {
    daily: usageCounter.daily,
    hourly: usageCounter.hourly,
  };
}

module.exports = { initAIClient, analyzeScreenshot, getUsageStats };
