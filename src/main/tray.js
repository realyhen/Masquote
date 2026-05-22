/**
 * 시스템 트레이 모듈
 *
 * 역할: Windows 시스템 트레이에 아이콘을 표시하고 컨텍스트 메뉴를 제공한다.
 *       메뉴: 보이기/숨기기, 지금 한마디, 설정 열기, 자동 시작 토글, 종료.
 */

const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

/** @type {Tray|null} */
let tray = null;

/** @type {object} 메인 윈도우 핸들 + 콜백 모음 (createTray 호출 시 주입) */
let handles = null;

/**
 * 트레이를 생성한다.
 *
 * @param {object} options
 * @param {() => import('electron').BrowserWindow|null} options.getMainWindow - 마스코트 윈도우 반환
 * @param {() => void} options.openSettings - 설정 윈도우 열기
 * @param {() => void} options.triggerAnalysis - "지금 한마디" 트리거
 * @returns {Tray}
 */
function createTray(options) {
  handles = options;

  const iconPath = path.join(__dirname, '..', 'assets', 'images', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Masquote - 모코');

  rebuildMenu();

  // 더블클릭: 마스코트 표시/숨기기 토글
  tray.on('double-click', toggleMascotVisibility);

  return tray;
}

/**
 * 메뉴를 다시 빌드한다. 자동 시작 토글 상태가 바뀌면 호출.
 */
function rebuildMenu() {
  if (!tray) return;

  const loginItem = app.getLoginItemSettings();

  const menu = Menu.buildFromTemplate([
    {
      label: '모코 보이기/숨기기',
      click: toggleMascotVisibility,
    },
    {
      label: '지금 한마디',
      click: () => {
        if (handles?.triggerAnalysis) handles.triggerAnalysis();
      },
    },
    { type: 'separator' },
    {
      label: '설정',
      click: () => {
        if (handles?.openSettings) handles.openSettings();
      },
    },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: loginItem.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath,
        });
        rebuildMenu();
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

/**
 * 마스코트 윈도우 표시 상태를 토글한다.
 */
function toggleMascotVisibility() {
  const win = handles?.getMainWindow?.();
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
  }
}

/**
 * 트레이를 정리한다. 앱 종료 시 호출.
 */
function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

module.exports = { createTray, rebuildMenu, destroyTray };
