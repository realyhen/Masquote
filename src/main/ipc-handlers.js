/**
 * IPC 핸들러 모듈
 *
 * 역할: 화면 캡처, AI 분석 등 Phase 2 IPC 채널을 등록한다.
 *       메인 프로세스와 렌더러 프로세스 사이의 통신을 중개한다.
 */

const { ipcMain, BrowserWindow } = require('electron');
const { captureScreen, captureIfChanged, resetChangeDetection } = require('./capturer');
const { analyzeScreenshot, getUsageStats } = require('./ai-client');

/** 기본 시스템 프롬프트 — Phase 4에서 prompt-manager로 이동 */
const DEFAULT_SYSTEM_PROMPT = `너는 '모코'야. 사용자의 데스크탑 화면 구석에 사는 귀여운 AI 마스코트야.

## 핵심 규칙
- 한국어 반말, 1문장 최대 40자
- 자연스러운 구어체 (추임새 OK: 음, 아, 헐, 와)
- 화면을 설명하지 마. 감정적 반응만 해
- 이전 반응과 겹치는 표현 금지

## 반응 유형 (돌아가며)
- 감탄: "오 집중력 미쳤다"
- 질문: "그거 재밌어?"
- 걱정: "눈 안 아파? 좀 쉬어~"
- 유머: "나도 같이 보고 싶다 ㅋㅋ"
- 감성: "이 시간에 일하는 너... 멋있어"`;

/**
 * 현재 시각과 상태 정보를 포함한 유저 프롬프트를 생성한다.
 *
 * @returns {string} 컨텍스트가 포함된 유저 프롬프트
 */
function buildUserPrompt() {
  const now = new Date();
  const hours = now.getHours();
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  // 시간대별 상태 추정
  let userState = '활동 중';
  if (hours >= 0 && hours < 6) userState = '야간 작업 중';
  else if (hours >= 6 && hours < 9) userState = '아침 시작';
  else if (hours >= 12 && hours < 14) userState = '점심 시간대';
  else if (hours >= 22) userState = '늦은 밤 작업 중';

  return `<context>
시각: ${timeStr} | 상태: ${userState}
</context>

모코의 반응:`;
}

/**
 * Phase 2 IPC 핸들러를 등록한다.
 *
 * @param {object} config - 앱 설정 객체
 */
function registerPhase2Handlers(config) {
  // 화면 캡처 요청
  ipcMain.handle('capture-screen', async (_event, options) => {
    try {
      const captureOpts = options || config.capture.analysis;
      return await captureScreen(captureOpts);
    } catch (err) {
      console.error('[IPC] capture-screen 오류:', err.message);
      return null;
    }
  });

  // 화면 분석 요청 — 캡처 + AI 분석을 한 번에 수행
  ipcMain.handle('analyze-screen', async (event) => {
    try {
      // 화면 캡처
      console.log('[IPC] 화면 캡처 시작...');
      const captureResult = await captureScreen(config.capture.analysis);
      if (!captureResult) {
        console.warn('[IPC] 캡처 실패 — null 반환됨');
        return {
          text: '화면을 볼 수가 없어... 보안 설정을 확인해줘!',
          source: 'capture_error',
        };
      }
      console.log(`[IPC] 캡처 성공 (${captureResult.sizeKB}KB), AI 분석 요청...`);

      // AI 분석
      const result = await analyzeScreenshot(captureResult.base64, {
        model: config.ai.primaryModel,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(),
        maxTokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
        limits: {
          dailyLimit: config.ai.dailyLimit,
          hourlyLimit: config.ai.hourlyLimit,
        },
      });

      // 렌더러에 응답 전달
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai-response', result);
      }

      return result;
    } catch (err) {
      console.error('[IPC] analyze-screen 오류:', err.message);
      const errorResult = {
        text: '앗, 뭔가 문제가 생겼어!',
        source: 'error',
      };

      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai-error', { message: errorResult.text, code: 'ANALYZE_FAILED' });
      }

      return errorResult;
    }
  });

  // 변화 감지 캡처 + 분석 — Phase 4 자동 트리거에서 사용
  ipcMain.handle('analyze-if-changed', async (event) => {
    try {
      const captureResult = await captureIfChanged(
        config.capture.comparison,
        config.capture.analysis
      );

      // 변화 없으면 분석 스킵
      if (!captureResult) {
        return { text: null, source: 'no_change' };
      }

      const result = await analyzeScreenshot(captureResult.base64, {
        model: config.ai.primaryModel,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(),
        maxTokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
        limits: {
          dailyLimit: config.ai.dailyLimit,
          hourlyLimit: config.ai.hourlyLimit,
        },
      });

      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ai-response', result);
      }

      return result;
    } catch (err) {
      console.error('[IPC] analyze-if-changed 오류:', err.message);
      return { text: null, source: 'error' };
    }
  });

  // API 사용량 조회
  ipcMain.handle('get-usage-stats', () => {
    return getUsageStats();
  });
}

module.exports = { registerPhase2Handlers };
