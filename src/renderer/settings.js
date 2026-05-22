/**
 * 설정 윈도우 렌더러
 *
 * 역할: 현재 설정을 읽어 폼에 채우고, 입력 변경 시 메인 프로세스에 IPC로 저장한다.
 *       저장은 debounce 없이 변경 즉시 반영 — 사용자가 닫아도 안전.
 */

(function () {
  'use strict';

  const els = {};

  /** 저장 상태 표시 타이머 */
  let statusTimer = null;

  /**
   * DOM 요소를 캐싱한다.
   */
  function cacheElements() {
    els.ttsEnabled = document.getElementById('tts-enabled');
    els.ttsRate = document.getElementById('tts-rate');
    els.ttsRateOut = document.getElementById('tts-rate-out');
    els.triggerIdle = document.getElementById('trigger-idle');
    els.triggerCooldown = document.getElementById('trigger-cooldown');
    els.triggerSleep = document.getElementById('trigger-sleep');
    els.movementEnabled = document.getElementById('movement-enabled');
    els.promptSelect = document.getElementById('prompt-select');
    els.aiDaily = document.getElementById('ai-daily');
    els.aiHourly = document.getElementById('ai-hourly');
    els.usageInfo = document.getElementById('usage-info');
    els.resetBtn = document.getElementById('reset-btn');
    els.saveStatus = document.getElementById('save-status');
  }

  /**
   * 현재 설정을 폼에 적용한다.
   * @param {object} config
   */
  function applyConfigToForm(config) {
    els.ttsEnabled.checked = !!config.tts?.enabled;
    els.ttsRate.value = config.tts?.rate ?? 1.0;
    els.ttsRateOut.textContent = Number(els.ttsRate.value).toFixed(1);

    els.triggerIdle.value = config.trigger?.idleMinutes ?? 3;
    els.triggerCooldown.value = config.trigger?.cooldownSeconds ?? 45;
    els.triggerSleep.value = config.trigger?.sleepMinutes ?? 10;

    els.movementEnabled.checked = !!config.movement?.enabled;

    els.promptSelect.value = config.ai?.forcedPrompt || '';
    els.aiDaily.value = config.ai?.dailyLimit ?? 240;
    els.aiHourly.value = config.ai?.hourlyLimit ?? 60;
  }

  /**
   * 사용 가능한 프롬프트 목록을 드롭다운에 채운다.
   * 메인이 노출한 채널이 없으면 하드코딩 fallback.
   */
  async function populatePromptOptions() {
    const names = ['기본', '츤데레', '응원단', '관찰자', '잠꾸러기'];
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      els.promptSelect.appendChild(opt);
    }
  }

  /**
   * API 사용량 정보를 표시한다.
   */
  async function refreshUsage() {
    try {
      const stats = await window.masquoteAPI.getUsageStats();
      const g = stats.gemini || { daily: 0, hourly: 0 };
      const q = stats.groq || { daily: 0, hourly: 0 };
      els.usageInfo.textContent = `사용량 — Gemini: ${g.daily}일 / ${g.hourly}시간 · Groq(폴백): ${q.daily}일 / ${q.hourly}시간`;
    } catch (_) {
      els.usageInfo.textContent = '';
    }
  }

  /**
   * "저장됨" 상태를 잠깐 표시한다.
   */
  function flashSaved() {
    els.saveStatus.textContent = '저장됨';
    els.saveStatus.classList.add('visible');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      els.saveStatus.classList.remove('visible');
    }, 1200);
  }

  /**
   * 단일 설정 값을 즉시 저장한다.
   * @param {string} dottedPath
   * @param {*} value
   */
  async function save(dottedPath, value) {
    try {
      const ok = await window.masquoteAPI.updateSetting(dottedPath, value);
      if (ok) flashSaved();
    } catch (err) {
      console.error('[Settings] 저장 실패:', err);
    }
  }

  /**
   * 폼 입력 변경 핸들러를 바인딩한다.
   */
  function bindHandlers() {
    els.ttsEnabled.addEventListener('change', () => save('tts.enabled', els.ttsEnabled.checked));

    els.ttsRate.addEventListener('input', () => {
      els.ttsRateOut.textContent = Number(els.ttsRate.value).toFixed(1);
    });
    els.ttsRate.addEventListener('change', () => save('tts.rate', Number(els.ttsRate.value)));

    els.triggerIdle.addEventListener('change', () => save('trigger.idleMinutes', clampInt(els.triggerIdle, 1, 60)));
    els.triggerCooldown.addEventListener('change', () => save('trigger.cooldownSeconds', clampInt(els.triggerCooldown, 10, 600)));
    els.triggerSleep.addEventListener('change', () => save('trigger.sleepMinutes', clampInt(els.triggerSleep, 5, 180)));

    els.movementEnabled.addEventListener('change', () => save('movement.enabled', els.movementEnabled.checked));

    els.promptSelect.addEventListener('change', () => {
      const val = els.promptSelect.value || null;
      save('ai.forcedPrompt', val);
    });

    els.aiDaily.addEventListener('change', () => save('ai.dailyLimit', clampInt(els.aiDaily, 10, 2000)));
    els.aiHourly.addEventListener('change', () => save('ai.hourlyLimit', clampInt(els.aiHourly, 5, 500)));

    els.resetBtn.addEventListener('click', async () => {
      const ok = await window.masquoteAPI.resetSettings();
      if (ok) {
        applyConfigToForm(ok);
        flashSaved();
      }
    });
  }

  /**
   * input의 정수 값을 [min, max]로 클램프하고 element에도 반영한다.
   */
  function clampInt(input, min, max) {
    let v = parseInt(input.value, 10);
    if (Number.isNaN(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    input.value = v;
    return v;
  }

  /**
   * 초기화.
   */
  async function init() {
    cacheElements();
    await populatePromptOptions();
    try {
      const config = await window.masquoteAPI.getConfig();
      applyConfigToForm(config);
    } catch (err) {
      console.error('[Settings] 설정 로드 실패:', err);
    }
    bindHandlers();
    refreshUsage();
    setInterval(refreshUsage, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
