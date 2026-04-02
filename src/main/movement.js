/**
 * 걷기 엔진 모듈
 *
 * 역할: 마스코트 윈도우를 화면 하단에서 좌우로 이동시킨다.
 *       화면 양쪽 끝에 닿으면 방향을 전환하고 renderer에 알린다.
 */

const { screen } = require('electron');

/** @type {ReturnType<typeof setInterval>|null} 이동 인터벌 */
let moveInterval = null;

/** @type {number} 현재 이동 방향 (1=오른쪽, -1=왼쪽) */
let direction = 1;

/** @type {number} 현재 이동 속도 (px/frame) */
let speed = 2;

/** 이동 인터벌 주기 (ms) — ~60fps */
const FRAME_MS = 16;

/**
 * 걷기를 시작한다.
 * 윈도우 x좌표를 매 프레임 speed만큼 이동한다.
 *
 * @param {BrowserWindow} win - 이동할 윈도우
 * @param {object} config - movement 설정
 * @param {number} config.speedMin - 최소 속도
 * @param {number} config.speedMax - 최대 속도
 */
function startWalk(win, config) {
  if (moveInterval) return; // 이미 걷기 중

  // 속도를 min~max 범위에서 랜덤 결정
  speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
  direction = Math.random() < 0.5 ? -1 : 1;

  // 초기 방향을 renderer에 알림
  sendDirection(win);

  moveInterval = setInterval(() => {
    if (!win || win.isDestroyed()) {
      stopWalk();
      return;
    }

    const bounds = win.getBounds();
    const workArea = screen.getPrimaryDisplay().workArea;

    let newX = bounds.x + direction * speed;

    // 화면 양쪽 끝에서 방향 전환
    if (newX <= workArea.x) {
      newX = workArea.x;
      direction = 1;
      sendDirection(win);
    } else if (newX + bounds.width >= workArea.x + workArea.width) {
      newX = workArea.x + workArea.width - bounds.width;
      direction = -1;
      sendDirection(win);
    }

    win.setBounds({
      x: Math.round(newX),
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  }, FRAME_MS);
}

/**
 * 걷기를 중지한다.
 */
function stopWalk() {
  if (moveInterval) {
    clearInterval(moveInterval);
    moveInterval = null;
  }
}

/**
 * 현재 방향을 renderer에 전달한다.
 * @param {BrowserWindow} win
 */
function sendDirection(win) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('walking-direction', direction === 1 ? 'right' : 'left');
  }
}

/**
 * 걷기 중인지 확인한다.
 * @returns {boolean}
 */
function isWalking() {
  return moveInterval !== null;
}

module.exports = { startWalk, stopWalk, isWalking };
