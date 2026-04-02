/**
 * Masquote - AI 데스크탑 마스코트 앱
 * 메인 프로세스 진입점
 *
 * 역할: 앱 생명주기 관리, 투명 마스코트 윈도우 생성, IPC 핸들러 등록
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { loadConfig } = require('./config');
const { initAIClient } = require('./ai-client');
const { registerPhase2Handlers } = require('./ipc-handlers');

// .env 파일에서 API 키 로드
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Windows 11 투명 렌더링 버그 방지 — GPU 가속 비활성화
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');

/** @type {BrowserWindow|null} 마스코트 메인 윈도우 */
let mainWindow = null;

/** @type {object} 앱 설정 */
let config = null;

/**
 * 마스코트 윈도우를 생성한다.
 * 투명 배경, 프레임 없음, always-on-top, 태스크바 미표시.
 * @returns {BrowserWindow} 생성된 윈도우 인스턴스
 */
function createMascotWindow() {
  const { width, height, alwaysOnTopLevel, alwaysOnTopRelativeLevel } = config.window;

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

  // 최상위 z-order 설정
  win.setAlwaysOnTop(true, alwaysOnTopLevel, alwaysOnTopRelativeLevel);

  // 초기 위치: 화면 우측 하단 (태스크바 위)
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
 * IPC 핸들러를 등록한다.
 * Phase 1: 마우스 이벤트 무시 설정, 드래그 이동
 */
function registerIpcHandlers() {
  // 클릭 통과 제어 — 투명 영역은 마우스 이벤트를 아래 창으로 통과
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setIgnoreMouseEvents(ignore, options || {});
      }
    } catch (err) {
      console.error('[IPC] set-ignore-mouse-events 오류:', err.message);
    }
  });

  // 드래그 이동 — 렌더러에서 mousedown 시 호출
  ipcMain.on('start-drag', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        // 커스텀 드래그: 렌더러에서 mousemove 좌표를 전달받아 윈도우 이동
        // Electron의 기본 드래그는 -webkit-app-region: drag를 사용
      }
    } catch (err) {
      console.error('[IPC] start-drag 오류:', err.message);
    }
  });

  // 윈도우 위치 이동 — 렌더러에서 드래그 중 좌표 전달
  ipcMain.on('move-window', (event, deltaX, deltaY) => {
    try {
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
    } catch (err) {
      console.error('[IPC] move-window 오류:', err.message);
    }
  });

  // 설정 조회
  ipcMain.handle('get-config', () => {
    return config;
  });
}

/**
 * 앱 초기화 — 설정 로드, 윈도우 생성, IPC 등록
 */
app.whenReady().then(() => {
  config = loadConfig();

  // Phase 1 IPC 핸들러
  registerIpcHandlers();

  // Phase 2: AI 클라이언트 초기화 + 캡처/분석 IPC 핸들러
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    initAIClient(geminiKey);
  } else {
    console.warn('[Main] GEMINI_API_KEY가 .env에 설정되지 않았습니다.');
  }
  registerPhase2Handlers(config);

  mainWindow = createMascotWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMascotWindow();
    }
  });
});

// 모든 윈도우가 닫히면 앱 종료
app.on('window-all-closed', () => {
  app.quit();
});
