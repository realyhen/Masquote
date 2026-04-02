/**
 * 렌더러 프로세스 진입점
 *
 * 역할: 캐릭터 UI 이벤트 바인딩, 클릭 통과 제어, 드래그 이동 처리,
 *       캐릭터 클릭 시 AI 분석 트리거, AI 응답 말풍선 표시
 */

(function () {
  'use strict';

  /** @type {HTMLElement} 캐릭터 컨테이너 */
  const mascotEl = document.getElementById('mascot');

  /** 드래그 상태 관리 */
  const dragState = {
    isDragging: false,
    didDrag: false,
    startX: 0,
    startY: 0,
  };

  /** 분석 중복 방지 플래그 */
  let isAnalyzing = false;

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
      if (e.button !== 0) return;

      dragState.isDragging = true;
      dragState.didDrag = false;
      dragState.startX = e.screenX;
      dragState.startY = e.screenY;

      window.masquoteAPI.setIgnoreMouseEvents(false);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragState.isDragging) return;

      const deltaX = e.screenX - dragState.startX;
      const deltaY = e.screenY - dragState.startY;

      if (deltaX !== 0 || deltaY !== 0) {
        dragState.didDrag = true;
        window.masquoteAPI.moveWindow(deltaX, deltaY);
        dragState.startX = e.screenX;
        dragState.startY = e.screenY;
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragState.isDragging) return;
      dragState.isDragging = false;
      window.masquoteAPI.setIgnoreMouseEvents(true, { forward: true });
    });
  }

  /**
   * 캐릭터 클릭 시 화면 분석을 트리거한다.
   * 드래그 동작과 구분하기 위해 didDrag 플래그를 확인한다.
   */
  function initClickAnalysis() {
    mascotEl.addEventListener('click', async () => {
      // 드래그 후 mouseup이면 클릭으로 취급하지 않음
      if (dragState.didDrag) return;

      // 중복 분석 방지
      if (isAnalyzing) return;

      await triggerAnalysis();
    });
  }

  /**
   * 화면 분석을 실행하고 결과를 말풍선으로 표시한다.
   * 분석 중에는 "생각하는 중..." 메시지를 표시한다.
   */
  async function triggerAnalysis() {
    isAnalyzing = true;

    try {
      // 분석 중 표시
      window.SpeechBubble.showBubble('음... 뭘 하고 있는 거지?', 10000, 30);

      // 화면 분석 요청
      const result = await window.masquoteAPI.analyzeScreen();

      if (result && result.text) {
        window.SpeechBubble.showBubble(result.text, 6000, 35);
      }
    } catch (err) {
      console.error('[App] 분석 실행 오류:', err);
      window.SpeechBubble.showBubble('앗, 뭔가 문제가 생겼어!', 3000, 30);
    } finally {
      isAnalyzing = false;
    }
  }

  /**
   * 메인 프로세스 이벤트 리스너를 등록한다.
   */
  function initEventListeners() {
    // AI 응답 수신 시 말풍선 표시 (메인에서 push하는 경우)
    window.masquoteAPI.on('ai-response', (data) => {
      window.SpeechBubble.showBubble(data.text, 6000, 35);
    });

    // 에러 수신 시 말풍선으로 안내
    window.masquoteAPI.on('ai-error', (data) => {
      window.SpeechBubble.showBubble(data.message, 3000, 30);
    });
  }

  /**
   * 앱 초기화
   */
  function init() {
    initClickThrough();
    initDrag();
    initClickAnalysis();
    initEventListeners();

    // 시작 인사
    window.SpeechBubble.showBubble('안녕! 나는 모코야~ 클릭하면 화면을 봐줄게!', 5000, 35);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
