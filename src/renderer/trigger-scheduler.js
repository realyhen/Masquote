/**
 * 자동 트리거 스케줄러
 *
 * 역할: 사용자 비활동(idle) 감지 후 자동으로 화면 분석을 트리거한다.
 *       쿨다운, sleep 모드를 관리하여 불필요한 API 호출을 방지한다.
 */

(function () {
  'use strict';

  /** @type {object} 트리거 설정 */
  let triggerConfig = null;

  /** @type {number} 마지막 사용자 입력 시각 (ms) */
  let lastActivityTime = Date.now();

  /** @type {number} 마지막 분석 완료 시각 (ms) */
  let lastAnalysisTime = 0;

  /** @type {number|null} idle 체크 인터벌 */
  let checkInterval = null;

  /** @type {boolean} sleep 모드 여부 */
  let isSleeping = false;

  /** @type {Function|null} 분석 트리거 콜백 */
  let onTrigger = null;

  /** idle 체크 주기 (ms) */
  const CHECK_INTERVAL_MS = 10000;

  /**
   * 스케줄러를 초기화한다.
   * @param {object} config - 앱 설정 (trigger 섹션 포함)
   * @param {Function} triggerCallback - idle 시 호출할 분석 함수
   */
  function init(config, triggerCallback) {
    triggerConfig = config.trigger;
    onTrigger = triggerCallback;

    // 사용자 입력 감시
    document.addEventListener('mousemove', onActivity);
    document.addEventListener('mousedown', onActivity);
    document.addEventListener('keydown', onActivity);
    document.addEventListener('wheel', onActivity);

    // 주기적으로 idle 상태 확인
    checkInterval = setInterval(checkIdle, CHECK_INTERVAL_MS);

    console.log(`[Trigger] 초기화 (idle: ${triggerConfig.idleMinutes}분, cooldown: ${triggerConfig.cooldownSeconds}초, sleep: ${triggerConfig.sleepMinutes}분)`);
  }

  /**
   * 사용자 활동 감지 시 호출된다.
   */
  function onActivity() {
    lastActivityTime = Date.now();

    // sleep 모드에서 깨어남
    if (isSleeping) {
      isSleeping = false;
      console.log('[Trigger] sleep 해제 — 사용자 활동 감지');
    }
  }

  /**
   * idle 상태를 확인하고 필요 시 자동 분석을 트리거한다.
   */
  async function checkIdle() {
    if (!triggerConfig || !onTrigger) return;

    const now = Date.now();
    const idleDuration = now - lastActivityTime;
    const idleThreshold = triggerConfig.idleMinutes * 60 * 1000;
    const sleepThreshold = triggerConfig.sleepMinutes * 60 * 1000;
    const cooldown = triggerConfig.cooldownSeconds * 1000;

    // sleep 모드 진입 확인
    if (idleDuration >= sleepThreshold) {
      if (!isSleeping) {
        isSleeping = true;
        console.log('[Trigger] sleep 모드 진입 — 자동 트리거 정지');
      }
      return;
    }

    // sleep 중이면 스킵
    if (isSleeping) return;

    // idle 시간 미달이면 스킵
    if (idleDuration < idleThreshold) return;

    // 쿨다운 확인
    if (now - lastAnalysisTime < cooldown) return;

    // 자동 분석 트리거
    console.log('[Trigger] idle 감지 — 자동 분석 시작');
    lastAnalysisTime = now;

    try {
      await onTrigger();
    } catch (err) {
      console.error('[Trigger] 자동 분석 오류:', err);
    }
  }

  /**
   * 수동 분석 시 쿨다운 타이머를 갱신한다.
   * (클릭 분석 후 호출하여 쿨다운 리셋)
   */
  function markAnalysis() {
    lastAnalysisTime = Date.now();
  }

  /**
   * 스케줄러를 정지한다.
   */
  function destroy() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    document.removeEventListener('mousemove', onActivity);
    document.removeEventListener('mousedown', onActivity);
    document.removeEventListener('keydown', onActivity);
    document.removeEventListener('wheel', onActivity);
  }

  window.TriggerScheduler = { init, markAnalysis, destroy };
})();
