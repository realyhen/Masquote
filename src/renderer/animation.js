/**
 * 캐릭터 애니메이션 상태 머신
 *
 * 역할: idle / walking / speaking 상태를 관리하고,
 *       상태에 따라 CSS 클래스를 전환한다.
 *       걷기 주기를 타이머로 제어한다.
 */

(function () {
  'use strict';

  /** @type {'idle'|'walking'|'speaking'} 현재 상태 */
  let currentState = 'idle';

  /** @type {number|null} idle→walking 전환 타이머 */
  let walkTimer = null;

  /** @type {number|null} walking→idle 전환 타이머 */
  let walkEndTimer = null;

  /** @type {HTMLElement} 캐릭터 컨테이너 */
  let mascotEl = null;

  /** @type {object} movement 설정 */
  let movementConfig = null;

  /**
   * 상태 머신을 초기화한다.
   * @param {object} config - 앱 설정 (movement 섹션 포함)
   */
  function init(config) {
    mascotEl = document.getElementById('mascot');
    movementConfig = config.movement;

    // 초기 상태: idle
    setState('idle');

    // 걷기가 활성화되어있으면 idle→walking 주기 시작
    if (movementConfig.enabled) {
      scheduleNextWalk();
    }
  }

  /**
   * 상태를 전환하고 CSS 클래스를 업데이트한다.
   * @param {'idle'|'walking'|'speaking'} newState
   * @param {object} [options] - 추가 옵션
   * @param {string} [options.direction] - 걷기 방향 ('left'|'right')
   */
  function setState(newState, options = {}) {
    if (currentState === newState) return;

    const prev = currentState;
    currentState = newState;

    // CSS 클래스 정리 후 새 상태 적용
    mascotEl.classList.remove('mascot-idle', 'mascot-walking', 'mascot-speaking', 'walk-left', 'walk-right');
    mascotEl.classList.add(`mascot-${newState}`);

    if (newState === 'walking' && options.direction) {
      mascotEl.classList.add(`walk-${options.direction}`);
    }

    console.log(`[Animation] ${prev} → ${newState}`);
  }

  /**
   * 걷기 방향 CSS 클래스를 업데이트한다 (걷기 중 방향 전환 시).
   * @param {'left'|'right'} direction
   */
  function updateDirection(direction) {
    mascotEl.classList.remove('walk-left', 'walk-right');
    mascotEl.classList.add(`walk-${direction}`);
  }

  /**
   * 다음 걷기까지 타이머를 설정한다.
   */
  function scheduleNextWalk() {
    clearTimers();
    walkTimer = setTimeout(() => {
      startWalking();
    }, movementConfig.pauseDurationMs);
  }

  /**
   * 걷기를 시작한다.
   */
  function startWalking() {
    if (currentState === 'speaking') return; // 말하는 중이면 걷지 않음

    setState('walking', { direction: 'right' });

    // main 프로세스에 걷기 시작 요청
    window.masquoteAPI.startWalk();

    // walkDurationMs 후 걷기 종료
    walkEndTimer = setTimeout(() => {
      stopWalking();
    }, movementConfig.walkDurationMs);
  }

  /**
   * 걷기를 중지하고 idle로 전환한다.
   */
  function stopWalking() {
    if (currentState !== 'walking') return;

    window.masquoteAPI.stopWalk();
    setState('idle');

    // 다음 걷기 주기 예약
    scheduleNextWalk();
  }

  /**
   * 말하기 상태로 전환한다 (AI 분석 시작 시).
   * 걷기 중이면 즉시 중단한다.
   */
  function startSpeaking() {
    clearTimers();

    if (currentState === 'walking') {
      window.masquoteAPI.stopWalk();
    }

    setState('speaking');
  }

  /**
   * 말하기 완료 후 idle로 복귀한다.
   * 걷기 주기를 다시 시작한다.
   */
  function stopSpeaking() {
    if (currentState !== 'speaking') return;

    setState('idle');

    if (movementConfig.enabled) {
      scheduleNextWalk();
    }
  }

  /**
   * 모든 타이머를 정리한다.
   */
  function clearTimers() {
    if (walkTimer) {
      clearTimeout(walkTimer);
      walkTimer = null;
    }
    if (walkEndTimer) {
      clearTimeout(walkEndTimer);
      walkEndTimer = null;
    }
  }

  /**
   * 현재 상태를 반환한다.
   * @returns {'idle'|'walking'|'speaking'}
   */
  function getState() {
    return currentState;
  }

  /**
   * movement 설정만 갱신한다 (앱 실행 중 사용자가 설정 UI에서 바꿨을 때).
   * enabled=false → 진행 중 걷기/예약 즉시 중단. enabled=true → idle이면 다음 walk 예약.
   * @param {object} config - 전체 설정 객체 (movement 섹션 포함)
   */
  function updateConfig(config) {
    if (!config || !config.movement) return;
    const wasEnabled = movementConfig?.enabled;
    movementConfig = config.movement;
    console.log(`[Animation] movement 설정 갱신 (enabled: ${movementConfig.enabled})`);

    if (wasEnabled && !movementConfig.enabled) {
      // 끄기: 예약 + 진행중 걷기 즉시 중단
      clearTimers();
      if (currentState === 'walking') {
        window.masquoteAPI.stopWalk();
        setState('idle');
      }
    } else if (!wasEnabled && movementConfig.enabled) {
      // 켜기: idle이면 다음 walk 예약
      if (currentState === 'idle') scheduleNextWalk();
    }
  }

  // 전역 노출
  window.MascotAnimation = {
    init,
    setState,
    updateDirection,
    startSpeaking,
    stopSpeaking,
    stopWalking,
    getState,
    updateConfig,
  };
})();
