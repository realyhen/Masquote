/**
 * 설정 윈도우 모듈
 *
 * 역할: 트레이 메뉴에서 호출되는 설정 BrowserWindow를 생성/관리한다.
 *       이미 열려있으면 포커스만 이동한다.
 */

const { BrowserWindow } = require('electron');
const path = require('node:path');

/** @type {BrowserWindow|null} */
let settingsWindow = null;

/**
 * 설정 윈도우를 생성하거나 기존 윈도우를 포커스한다.
 * @returns {BrowserWindow}
 */
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 640,
    title: 'Masquote 설정',
    resizable: false,
    minimizable: true,
    maximizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

/**
 * 설정 윈도우가 열려있는지 확인한다.
 * @returns {boolean}
 */
function isSettingsWindowOpen() {
  return !!(settingsWindow && !settingsWindow.isDestroyed());
}

module.exports = { createSettingsWindow, isSettingsWindowOpen };
