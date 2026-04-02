/**
 * 렌더러 프로세스 진입점
 *
 * 역할: 캐릭터 UI 이벤트 바인딩, 클릭 통과 제어, 드래그 이동 처리
 */

(function () {
  'use strict';

  /** @type {HTMLElement} 캐릭터 컨테이너 */
  const mascotEl = document.getElementById('mascot');

  /** 드래그 상태 관리 */
  const dragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
  };

  /**
   * 클릭 통과 제어를 초기화한다.
   * 캐릭터 위에 마우스가 있으면 클릭 수신, 벗어나면 클릭 통과.
   */
  function initClickThrough() {
    mascotEl.addEventListener('mouseenter', () => {
      window.masquoteAPI.setIgnoreMouseEvents(false);
    });

    mascotEl.addEventListener('mouseleave', () => {
      if (!dragState.isDragging) {
        window.masquoteAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    // 초기 상태: 클릭 통과 활성화 (투명 영역이 대부분이므로)
    window.masquoteAPI.setIgnoreMouseEvents(true, { forward: true });
  }

  /**
   * 드래그 이동을 초기화한다.
   * 캐릭터를 마우스로 잡고 끌어서 윈도우 위치를 이동한다.
   */
  function initDrag() {
    mascotEl.addEventListener('mousedown', (e) => {
      // 좌클릭만 허용
      if (e.button !== 0) return;

      dragState.isDragging = true;
      dragState.startX = e.screenX;
      dragState.startY = e.screenY;

      // 드래그 중에는 클릭 통과 비활성화
      window.masquoteAPI.setIgnoreMouseEvents(false);

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragState.isDragging) return;

      const deltaX = e.screenX - dragState.startX;
      const deltaY = e.screenY - dragState.startY;

      // 델타가 0이면 불필요한 IPC 호출 방지
      if (deltaX !== 0 || deltaY !== 0) {
        window.masquoteAPI.moveWindow(deltaX, deltaY);
        dragState.startX = e.screenX;
        dragState.startY = e.screenY;
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragState.isDragging) return;

      dragState.isDragging = false;

      // 마우스가 캐릭터 밖에 있을 수 있으므로 클릭 통과 복원
      window.masquoteAPI.setIgnoreMouseEvents(true, { forward: true });
    });
  }

  /**
   * 말풍선을 표시한다 (Phase 2에서 본격 사용)
   * @param {string} text - 표시할 텍스트
   * @param {number} [durationMs=5000] - 표시 시간 (밀리초)
   */
  function showSpeechBubble(text, durationMs = 5000) {
    const bubble = document.getElementById('speech-bubble');
    const textEl = document.getElementById('speech-text');

    textEl.textContent = text;
    bubble.classList.remove('hidden');

    // 일정 시간 후 숨김
    clearTimeout(showSpeechBubble._hideTimer);
    showSpeechBubble._hideTimer = setTimeout(() => {
      bubble.classList.add('hidden');
    }, durationMs);
  }
  showSpeechBubble._hideTimer = null;

  /**
   * 메인 프로세스 이벤트 리스너를 등록한다.
   */
  function initEventListeners() {
    // AI 응답 수신 시 말풍선 표시 (Phase 2에서 활성화)
    window.masquoteAPI.on('ai-response', (data) => {
      showSpeechBubble(data.text);
    });

    // 에러 수신 시 말풍선으로 안내
    window.masquoteAPI.on('ai-error', (data) => {
      showSpeechBubble(data.message, 3000);
    });
  }

  /**
   * 앱 초기화
   */
  function init() {
    initClickThrough();
    initDrag();
    initEventListeners();

    // Phase 1 동작 확인용 — 시작 인사
    showSpeechBubble('안녕! 나는 모코야~ 🐾', 4000);
  }

  // DOM 로드 완료 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
