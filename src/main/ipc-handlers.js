/**
 * IPC 핸들러 모듈
 *
 * 역할: 화면 캡처, AI 분석, 걷기, 프롬프트, 설정 등 IPC 채널을 등록한다.
 *       메인 프로세스와 렌더러 프로세스 사이의 통신을 중개한다.
 */

const { ipcMain, BrowserWindow } = require('electron');
const { captureScreen, captureIfChanged } = require('./capturer');
const { analyzeScreenshot, getUsageStats } = require('./ai-client');
const { startWalk, stopWalk } = require('./movement');
const { getNextPrompt, buildUserPrompt } = require('./prompt-manager');
const { getSettings, updateSetting, updateSettings, resetSettings } = require('./settings');

/**
 * 설정 변경을 모든 윈도우에 브로드캐스트한다.
 * 렌더러는 'settings-updated' 이벤트로 받아 자체 모듈에 반영한다.
 * @param {object} settings - 갱신된 전체 설정
 */
function broadcastSettings(settings) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('settings-updated', settings);
    }
  }
}

/**
 * AI 분석 옵션을 빌드한다. 항상 최신 설정과 프롬프트를 사용한다.
 * @returns {object} analyzeScreenshot에 전달할 옵션
 */
function buildAnalysisOptions() {
  const config = getSettings();
  const forced = config.ai?.forcedPrompt;
  const { name, prompt } = getNextPrompt(forced);
  console.log(`[IPC] 프롬프트: ${name}${forced ? ' (강제)' : ''}`);
  return {
    model: config.ai.primaryModel,
    fallbackModel: config.ai.fallbackModel,
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
 */
function registerIpcHandlers() {
  // ── 기본 윈도우 제어 ──

  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options || {});
  });

  ipcMain.on('move-window', (event, deltaX, deltaY) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const bounds = win.getBounds();
      win.setBounds({
        x: bounds.x + deltaX,
        y: bounds.y + deltaY,
        width: bounds.width,
        height: bounds.height,
      });
    }
  });

  // ── 설정 ──

  ipcMain.handle('get-config', () => getSettings());

  ipcMain.handle('update-setting', (_event, dottedPath, value) => {
    const ok = updateSetting(dottedPath, value);
    if (ok) broadcastSettings(getSettings());
    return ok;
  });

  ipcMain.handle('update-settings', (_event, patches) => {
    const ok = updateSettings(patches);
    if (ok) broadcastSettings(getSettings());
    return ok;
  });

  ipcMain.handle('reset-settings', () => {
    const fresh = resetSettings();
    broadcastSettings(fresh);
    return fresh;
  });

  // ── 화면 캡처/분석 ──

  ipcMain.handle('capture-screen', async (_event, options) => {
    try {
      const cfg = getSettings();
      return await captureScreen(options || cfg.capture.analysis);
    } catch (err) {
      console.error('[IPC] capture-screen 오류:', err.message);
      return null;
    }
  });

  ipcMain.handle('analyze-screen', async () => {
    try {
      const cfg = getSettings();
      console.log('[IPC] 화면 캡처 시작...');
      const captureResult = await captureScreen(cfg.capture.analysis);
      if (!captureResult) {
        console.warn('[IPC] 캡처 실패');
        return { text: '화면을 볼 수가 없어... 보안 설정을 확인해줘!', source: 'capture_error' };
      }
      console.log(`[IPC] 캡처 성공 (${captureResult.sizeKB}KB), AI 분석 요청...`);
      return await analyzeScreenshot(captureResult.base64, buildAnalysisOptions());
    } catch (err) {
      console.error('[IPC] analyze-screen 오류:', err.message);
      return { text: '앗, 뭔가 문제가 생겼어!', source: 'error' };
    }
  });

  ipcMain.handle('analyze-if-changed', async () => {
    try {
      const cfg = getSettings();
      const captureResult = await captureIfChanged(cfg.capture.comparison, cfg.capture.analysis);
      if (!captureResult) {
        return { text: null, source: 'no_change' };
      }
      return await analyzeScreenshot(captureResult.base64, buildAnalysisOptions());
    } catch (err) {
      console.error('[IPC] analyze-if-changed 오류:', err.message);
      return { text: null, source: 'error' };
    }
  });

  ipcMain.handle('get-usage-stats', () => getUsageStats());

  // ── 걷기 ──

  ipcMain.on('start-walk', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) startWalk(win, getSettings().movement);
  });

  ipcMain.on('stop-walk', () => stopWalk());
}

module.exports = { registerIpcHandlers, broadcastSettings };
