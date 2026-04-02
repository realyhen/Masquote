/**
 * 설정 관리 모듈
 *
 * 역할: config/default.json을 로드하고 사용자 설정과 병합한다.
 *       Phase 5에서 사용자 설정 저장/로드 기능이 추가된다.
 */

const fs = require('node:fs');
const path = require('node:path');

/** 기본 설정 파일 경로 */
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'default.json');

/**
 * 기본 설정을 로드한다.
 * 파일 읽기 실패 시 하드코딩된 최소 설정을 반환한다.
 * @returns {object} 설정 객체
 */
function loadConfig() {
  try {
    const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Config] 설정 파일 로드 실패, 기본값 사용:', err.message);
    return getMinimalConfig();
  }
}

/**
 * 파일 로드 실패 시 사용할 최소 설정
 * @returns {object} 최소 설정 객체
 */
function getMinimalConfig() {
  return {
    window: {
      width: 200,
      height: 250,
      alwaysOnTopLevel: 'screen-saver',
      alwaysOnTopRelativeLevel: 1,
    },
    character: {
      defaultImage: 'moko.png',
    },
    capture: {
      intervalSeconds: 10,
      analysis: { maxWidth: 1280, maxHeight: 720, quality: 80 },
    },
    ai: { dailyLimit: 240, hourlyLimit: 60 },
    tts: { lang: 'ko-KR', rate: 1.0, enabled: true },
    movement: { enabled: true, speedMin: 1, speedMax: 3 },
  };
}

module.exports = { loadConfig };
