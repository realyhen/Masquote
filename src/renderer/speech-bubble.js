/**
 * 말풍선 모듈
 *
 * 역할: AI 응답 텍스트를 말풍선에 타이핑 효과로 표시하고,
 *       일정 시간 후 자동으로 숨긴다.
 */

/** @type {number|null} 숨김 타이머 ID */
let hideTimer = null;

/** @type {number|null} 타이핑 애니메이션 interval ID */
let typingInterval = null;

/** @type {boolean} 현재 말풍선이 표시 중인지 여부 */
let isShowing = false;

/**
 * 타이핑 효과와 함께 말풍선을 표시한다.
 * 이전 표시가 진행 중이면 즉시 중단하고 새 텍스트를 표시한다.
 *
 * @param {string} text - 표시할 텍스트
 * @param {number} [durationMs=5000] - 타이핑 완료 후 표시 유지 시간 (밀리초)
 * @param {number} [typingSpeedMs=40] - 글자당 타이핑 속도 (밀리초)
 * @param {Function} [onTypingDone] - 타이핑 완료 시 호출되는 콜백
 */
function showBubble(text, durationMs = 5000, typingSpeedMs = 40, onTypingDone = null) {
  const bubble = document.getElementById('speech-bubble');
  const textEl = document.getElementById('speech-text');

  if (!bubble || !textEl) return;

  // 이전 애니메이션 정리
  clearTimers();

  // 말풍선 표시
  textEl.textContent = '';
  bubble.classList.remove('hidden');
  isShowing = true;

  // 타이핑 효과
  let charIndex = 0;
  typingInterval = setInterval(() => {
    if (charIndex < text.length) {
      textEl.textContent += text[charIndex];
      charIndex++;
    } else {
      clearInterval(typingInterval);
      typingInterval = null;

      // 타이핑 완료 콜백 (TTS 등)
      if (onTypingDone) onTypingDone(text);

      // 타이핑 완료 후 일정 시간 뒤 숨김
      hideTimer = setTimeout(() => {
        hideBubble();
      }, durationMs);
    }
  }, typingSpeedMs);
}

/**
 * 말풍선을 즉시 숨긴다.
 */
function hideBubble() {
  const bubble = document.getElementById('speech-bubble');
  if (bubble) {
    bubble.classList.add('hidden');
  }
  clearTimers();
  isShowing = false;
}

/**
 * 진행 중인 타이머를 모두 정리한다.
 */
function clearTimers() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
}

/**
 * 말풍선이 현재 표시 중인지 확인한다.
 *
 * @returns {boolean} 표시 중 여부
 */
function isBubbleShowing() {
  return isShowing;
}

// 전역으로 노출 (렌더러 IIFE에서 사용)
window.SpeechBubble = { showBubble, hideBubble, isBubbleShowing };
