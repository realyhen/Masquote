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
   * 단일 설정 갱신 (점 표기 경로)
   * @param {string} dottedPath - 예: "tts.rate", "movement.enabled"
   * @param {*} value
   * @returns {Promise<boolean>}
   */
  updateSetting: (dottedPath, value) => {
    return ipcRenderer.invoke('update-setting', dottedPath, value);
  },

  /**
   * 여러 설정 일괄 갱신
   * @param {Record<string, *>} patches
   * @returns {Promise<boolean>}
   */
  updateSettings: (patches) => {
    return ipcRenderer.invoke('update-settings', patches);
  },

  /**
   * 사용자 설정 초기화 (기본값 복귀)
   * @returns {Promise<object>} 새 설정
   */
  resetSettings: () => {
    return ipcRenderer.invoke('reset-settings');
  },

  /**
   * 화면 캡처 요청
   * @param {object} [options] - 캡처 옵션 { maxWidth, maxHeight, quality }
   * @returns {Promise<{base64: string, mimeType: string, sizeKB: number}|null>}
   */
  captureScreen: (options) => {
    return ipcRenderer.invoke('capture-screen', options);
  },

  /**
   * 화면 분석 요청 (캡처 + AI 분석 통합)
   * @returns {Promise<{text: string, source: string}>} AI 응답
   */
  analyzeScreen: () => {
    return ipcRenderer.invoke('analyze-screen');
  },

  /**
   * 변화 감지 분석 요청 (변화 없으면 스킵, Phase 4 자동 트리거용)
   * @returns {Promise<{text: string|null, source: string}>} AI 응답 또는 no_change
   */
  analyzeIfChanged: () => {
    return ipcRenderer.invoke('analyze-if-changed');
  },

  /**
   * API 사용량 조회
   * @returns {Promise<{gemini: {daily,hourly}, groq: {daily,hourly}}>}
   */
  getUsageStats: () => {
    return ipcRenderer.invoke('get-usage-stats');
  },

  /**
   * 사용 가능한 프롬프트 변형 이름 목록 조회
   * @returns {Promise<string[]>}
   */
  getPromptNames: () => {
    return ipcRenderer.invoke('get-prompt-names');
  },

  /**
   * 걷기 시작 요청 (Phase 3)
   */
  startWalk: () => {
    ipcRenderer.send('start-walk');
  },

  /**
   * 걷기 중지 요청 (Phase 3)
   */
  stopWalk: () => {
    ipcRenderer.send('stop-walk');
  },

  /**
   * 메인 프로세스 이벤트 수신 리스너 등록
   * @param {string} channel - 채널명
   * @param {Function} callback - 콜백 함수
   * @returns {Function|undefined} 해제용 함수 (off에 전달)
   */
  on: (channel, callback) => {
    const validChannels = [
      'ai-response',
      'ai-error',
      'walking-direction',
      'settings-updated',
      'tray-trigger-analysis',
    ];
    if (validChannels.includes(channel)) {
      const wrapped = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, wrapped);
      return wrapped;
    }
  },

  /**
   * 메인 프로세스 이벤트 리스너 해제
   * @param {string} channel - 채널명
   * @param {Function} wrapped - on()이 반환한 래핑된 함수
   */
  off: (channel, wrapped) => {
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped);
    }
  },
});
