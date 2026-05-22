/**
 * TTS (Text-to-Speech) 모듈
 *
 * 역할: Web Speech API를 사용하여 AI 응답을 음성으로 읽어준다.
 */

(function () {
  'use strict';

  /** @type {object} TTS 설정 */
  let ttsConfig = { lang: 'ko-KR', rate: 1.0, enabled: true };

  /**
   * TTS를 초기화한다.
   * @param {object} config - 앱 설정의 tts 섹션
   */
  function init(config) {
    if (config) {
      ttsConfig = config;
    }
    console.log(`[TTS] 초기화 (enabled: ${ttsConfig.enabled}, lang: ${ttsConfig.lang})`);
  }

  /**
   * 텍스트를 음성으로 읽는다.
   * @param {string} text - 읽을 텍스트
   */
  function speak(text) {
    if (!ttsConfig.enabled) return;
    if (!window.speechSynthesis) {
      console.warn('[TTS] Web Speech API 미지원');
      return;
    }

    // 이전 음성 중단
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ttsConfig.lang;
    utterance.rate = ttsConfig.rate;

    // 한국어 음성 선호
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find((v) => v.lang.startsWith('ko'));
    if (koVoice) {
      utterance.voice = koVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  /**
   * 현재 음성을 중단한다.
   */
  function cancel() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * 설정만 갱신한다 (앱 실행 중 사용자가 설정 UI에서 바꿨을 때).
   * @param {object} config - 새 tts 설정
   */
  function updateConfig(config) {
    if (config) ttsConfig = { ...ttsConfig, ...config };
  }

  window.TTS = { init, speak, cancel, updateConfig };
})();
