/**
 * IPC 핸들러 모듈
 *
 * 역할: 화면 캡처, AI 분석, 걷기, 프롬프트 등 IPC 채널을 등록한다.
 *       메인 프로세스와 렌더러 프로세스 사이의 통신을 중개한다.
 */

const { ipcMain, BrowserWindow } = require('electron');
const { captureScreen, captureIfChanged } = require('./capturer');
const { analyzeScreenshot, getUsageStats } = require('./ai-client');
const { startWalk, stopWalk } = require('./movement');
const { getNextPrompt, buildUserPrompt } = require('./prompt-manager');

/**
 * AI 분석 옵션을 빌드한다.
 * @param {object} config - 앱 설정
 * @returns {object} analyzeScreenshot에 전달할 옵션
 */
function buildAnalysisOptions(config) {
  const { name, prompt } = getNextPrompt();
  console.log(`[IPC] 프롬프트: ${name}`);
  return {
    model: config.ai.primaryModel,
    systemPrompt: prompt,
    userPrompt: buildUserPrompt(),
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
    limits: {
      dailyLimit: config.ai.dailyLimit,
      hourlyLimit: config.ai.hourlyLimit,
    },
  };
}

/**
 * IPC 핸들러를 등록한다.
 * @param {object} config - 앱 설정 객체
 */
function registerIpcHandlers(config) {
  // 화면 캡처 요청
  ipcMain.handle('capture-screen', async (_event, options) => {
    try {
      return await captureScreen(options || config.capture.analysis);
    } catch (err) {
      console.error('[IPC] capture-screen 오류:', err.message);
      return null;
    }
  });

  // 화면 분석 요청 — 캡처 + AI 분석
  ipcMain.handle('analyze-screen', async () => {
    try {
      console.log('[IPC] 화면 캡처 시작...');
      const captureResult = await captureScreen(config.capture.analysis);
      if (!captureResult) {
        console.warn('[IPC] 캡처 실패');
        return { text: '화면을 볼 수가 없어... 보안 설정을 확인해줘!', source: 'capture_error' };
      }
      console.log(`[IPC] 캡처 성공 (${captureResult.sizeKB}KB), AI 분석 요청...`);
      return await analyzeScreenshot(captureResult.base64, buildAnalysisOptions(config));
    } catch (err) {
      console.error('[IPC] analyze-screen 오류:', err.message);
      return { text: '앗, 뭔가 문제가 생겼어!', source: 'error' };
    }
  });

  // 변화 감지 캡처 + 분석 — 자동 트리거에서 사용
  ipcMain.handle('analyze-if-changed', async () => {
    try {
      const captureResult = await captureIfChanged(config.capture.comparison, config.capture.analysis);
      if (!captureResult) {
        return { text: null, source: 'no_change' };
      }
      return await analyzeScreenshot(captureResult.base64, buildAnalysisOptions(config));
    } catch (err) {
      console.error('[IPC] analyze-if-changed 오류:', err.message);
      return { text: null, source: 'error' };
    }
  });

  // API 사용량 조회
  ipcMain.handle('get-usage-stats', () => getUsageStats());

  // 걷기 시작/중지
  ipcMain.on('start-walk', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) startWalk(win, config.movement);
  });

  ipcMain.on('stop-walk', () => stopWalk());
}

module.exports = { registerIpcHandlers };
