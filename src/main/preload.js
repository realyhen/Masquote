/**
 * Preload 스크립트
 *
 * 역할: contextBridge를 통해 렌더러에 안전한 IPC 인터페이스를 노출한다.
 *       nodeIntegration: false 환경에서 메인 프로세스와 통신하는 유일한 창구.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('masquoteAPI', {
  /**
   * 마우스 이벤트 무시 설정 (클릭 통과 제어)
   * @param {boolean} ignore - true면 클릭 통과, false면 클릭 수신
   * @param {object} [options] - { forward: true }로 mousemove는 계속 수신
   */
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },

  /**
   * 윈도우 이동 (드래그 중 좌표 델타 전달)
   * @param {number} deltaX - X축 이동량
   * @param {number} deltaY - Y축 이동량
   */
  moveWindow: (deltaX, deltaY) => {
    ipcRenderer.send('move-window', deltaX, deltaY);
  },

  /**
   * 앱 설정 조회
   * @returns {Promise<object>} 설정 객체
   */
  getConfig: () => {
    return ipcRenderer.invoke('get-config');
  },

  /**
   * 메인 프로세스 이벤트 수신 리스너 등록
   * @param {string} channel - 채널명
   * @param {Function} callback - 콜백 함수
   */
  on: (channel, callback) => {
    const validChannels = [
      'ai-response',
      'ai-error',
      'animation-state',
      'capture-status',
      'config-updated',
      'trigger-fired',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
});
