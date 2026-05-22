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
    /** 드래그로 판정할 최소 이동 거리 (px) — 이보다 작으면 클릭으로 취급 */
    threshold: 5,
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

    // 말풍선 위에서도 클릭 수신 (말풍선 클릭으로 숨기기 등)
    const bubbleEl = document.getElementById('speech-bubble');
    if (bubbleEl) {
      bubbleEl.addEventListener('mouseenter', () => {
        window.masquoteAPI.setIgnoreMouseEvents(false);
      });
      bubbleEl.addEventListener('mouseleave', () => {
        if (!dragState.isDragging) {
          window.masquoteAPI.setIgnoreMouseEvents(true, { forward: true });
        }
      });
    }

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
        // 임계값을 넘어야 드래그로 판정 (살짝 흔들림은 클릭으로 유지)
        if (!dragState.didDrag) {
          const dist = Math.abs(deltaX) + Math.abs(deltaY);
          if (dist < dragState.threshold) return;
          dragState.didDrag = true;
        }
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
   * 화면 분석을 실행하고 결과를 말풍선 + TTS로 표시한다.
   * 수동 클릭과 자동 트리거 모두 이 함수를 경유한다.
   * @param {boolean} [isAuto=false] - 자동 트리거 여부
   */
  async function triggerAnalysis(isAuto = false) {
    isAnalyzing = true;

    try {
      window.MascotAnimation.startSpeaking();
      window.SpeechBubble.showBubble('화면 보는 중...', 15000, 30);
      console.log(`[App] 화면 분석 요청 시작 (${isAuto ? '자동' : '수동'})`);

      // 자동 트리거는 변화 감지 후 분석, 수동은 즉시 분석
      const result = isAuto
        ? await window.masquoteAPI.analyzeIfChanged()
        : await window.masquoteAPI.analyzeScreen();

      // 변화 없으면 조용히 복귀
      if (result && result.source === 'no_change') {
        window.SpeechBubble.hideBubble();
        return;
      }

      if (result && result.text) {
        // 말풍선 + 타이핑 완료 시 TTS
        window.SpeechBubble.showBubble(result.text, 8000, 35, (text) => {
          window.TTS.speak(text);
        });
      } else {
        window.SpeechBubble.showBubble('음... 잘 안 보여!', 3000, 30);
      }
    } catch (err) {
      console.error('[App] 분석 실행 오류:', err);
      window.SpeechBubble.showBubble('앗, 뭔가 문제가 생겼어!', 3000, 30);
    } finally {
      isAnalyzing = false;
      window.MascotAnimation.stopSpeaking();
      window.TriggerScheduler.markAnalysis();
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

    // 걷기 방향 전환 수신 (캐릭터 좌우 반전)
    window.masquoteAPI.on('walking-direction', (direction) => {
      window.MascotAnimation.updateDirection(direction);
    });

    // 설정 변경 broadcast 수신 — 각 모듈에 새 설정 전달
    window.masquoteAPI.on('settings-updated', (config) => {
      console.log('[App] 설정 갱신 수신');
      window.TTS.updateConfig(config.tts);
      window.TriggerScheduler.updateConfig(config);
    });

    // 트레이 메뉴에서 "지금 한마디" 트리거 수신
    window.masquoteAPI.on('tray-trigger-analysis', () => {
      if (!isAnalyzing) triggerAnalysis(false);
    });
  }

  /**
   * 앱 초기화
   */
  async function init() {
    initClickThrough();
    initDrag();
    initClickAnalysis();
    initEventListeners();

    // 시작 인사
    window.SpeechBubble.showBubble('안녕! 나는 모코야~ 클릭하면 화면을 봐줄게!', 5000, 35);

    // 설정 로드 후 모듈 초기화
    try {
      const config = await window.masquoteAPI.getConfig();
      window.MascotAnimation.init(config);
      window.TTS.init(config.tts);
      window.TriggerScheduler.init(config, () => triggerAnalysis(true));
    } catch (err) {
      console.error('[App] 모듈 초기화 실패:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
