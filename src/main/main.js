/**
 * Masquote - AI 데스크탑 마스코트 앱
 * 메인 프로세스 진입점
 *
 * 역할: 앱 생명주기 관리, 투명 마스코트 윈도우 생성, IPC 핸들러 등록,
 *       시스템 트레이 / 설정 윈도우 / 단일 인스턴스 락 관리.
 */

const { app, BrowserWindow, screen, dialog } = require('electron');
const path = require('node:path');
const { initSettings } = require('./settings');
const { initAIClient } = require('./ai-client');
const { registerIpcHandlers } = require('./ipc-handlers');
const { createTray, destroyTray } = require('./tray');
const { createSettingsWindow } = require('./settings-window');

// .env 파일에서 API 키 로드
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Windows 11 투명 렌더링 버그 방지 — GPU 가속 비활성화
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');

// 단일 인스턴스 락 — 두 번째 실행이 시도되면 기존 윈도우를 표시하고 종료
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

/** @type {BrowserWindow|null} 마스코트 메인 윈도우 */
let mainWindow = null;

/** @type {object} 앱 설정 */
let config = null;

/**
 * 마스코트 윈도우를 생성한다.
 * 투명 배경, 프레임 없음, always-on-top, 태스크바 미표시.
 * @returns {BrowserWindow}
 */
function createMascotWindow() {
  const { width, height, alwaysOnTopLevel } = config.window;

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, alwaysOnTopLevel);

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const x = workArea.x + workArea.width - width - 50;
  const y = workArea.y + workArea.height - height;
  win.setBounds({ x, y, width, height });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

/**
 * API 키 미설정 시 안내 다이얼로그를 띄운다.
 */
function showApiKeyWarning() {
  dialog.showMessageBox({
    type: 'warning',
    title: 'Masquote — API 키 필요',
    message: 'GEMINI_API_KEY가 설정되지 않았습니다.',
    detail: '.env 파일을 만들고 GEMINI_API_KEY=발급받은_키 를 입력해주세요.\n파일 위치: ' + path.join(__dirname, '..', '..', '.env'),
    buttons: ['확인'],
  });
}

/**
 * 앱 초기화 — 설정 로드, 윈도우 생성, IPC 등록, 트레이 생성
 */
app.whenReady().then(() => {
  config = initSettings();

  // AI 클라이언트 초기화 (Groq 키는 폴백용, 선택)
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (geminiKey) {
    initAIClient(geminiKey, groqKey);
  } else {
    console.warn('[Main] GEMINI_API_KEY가 .env에 설정되지 않았습니다.');
    showApiKeyWarning();
  }

  registerIpcHandlers();

  mainWindow = createMascotWindow();

  // 시스템 트레이 생성
  createTray({
    getMainWindow: () => mainWindow,
    openSettings: () => createSettingsWindow(),
    triggerAnalysis: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.webContents.send('tray-trigger-analysis');
      }
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMascotWindow();
    }
  });
});

// 모든 윈도우가 닫혀도 트레이가 살아있으면 종료하지 않는다.
// (트레이 메뉴의 "종료" 또는 app.quit()가 호출되면 before-quit에서 정리 후 종료)
app.on('window-all-closed', () => {
  // intentionally empty — 트레이만 남아도 앱은 살아있어야 함
});

app.on('before-quit', () => {
  destroyTray();
});
