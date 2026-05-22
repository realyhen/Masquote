/**
 * 사용자 설정 저장/로드 모듈
 *
 * 역할: config/default.json을 기본값으로 두고 userData/settings.json의
 *       사용자 오버라이드를 deep merge해서 최종 설정을 반환한다.
 *       값을 변경하면 사용자 오버라이드만 디스크에 영구 저장한다.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { loadConfig: loadDefaultConfig } = require('./config');

/** 현재 메모리에 로드된 병합 설정 */
let mergedConfig = null;

/** 사용자 오버라이드만 (저장용) */
let userOverrides = {};

/**
 * 사용자 설정 파일 경로를 반환한다. userData/settings.json.
 * @returns {string}
 */
function getUserSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

/**
 * 두 객체를 deep merge한다. source 값으로 target을 덮어쓰되,
 * 양쪽 다 plain object면 재귀적으로 병합한다. 배열/원시값은 source가 우선.
 * @param {object} target
 * @param {object} source
 * @returns {object} 새 객체
 */
function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) return source ?? target;
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(target[key]) && isPlainObject(source[key])) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 사용자 오버라이드를 디스크에서 로드한다. 파일이 없거나 손상이면 빈 객체.
 * @returns {object}
 */
function loadUserOverrides() {
  const p = getUserSettingsPath();
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (err) {
    console.warn('[Settings] 사용자 설정 로드 실패, 무시:', err.message);
    return {};
  }
}

/**
 * 사용자 오버라이드를 디스크에 저장한다.
 * @returns {boolean} 성공 여부
 */
function saveUserOverrides() {
  const p = getUserSettingsPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(userOverrides, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Settings] 사용자 설정 저장 실패:', err.message);
    return false;
  }
}

/**
 * 기본 설정 + 사용자 오버라이드를 병합해서 메모리에 로드한다.
 * 앱 시작 시 1회 호출.
 * @returns {object} 병합된 설정
 */
function initSettings() {
  const defaultConfig = loadDefaultConfig();
  userOverrides = loadUserOverrides();
  mergedConfig = deepMerge(defaultConfig, userOverrides);
  console.log('[Settings] 초기화 완료 (오버라이드 키:', Object.keys(userOverrides).length, ')');
  return mergedConfig;
}

/**
 * 현재 병합된 설정을 반환한다.
 * @returns {object}
 */
function getSettings() {
  if (!mergedConfig) return initSettings();
  return mergedConfig;
}

/**
 * 점 표기 경로(예: "tts.rate")로 값을 설정한다.
 * userOverrides와 mergedConfig 양쪽에 반영하고 디스크에 저장한다.
 * @param {string} dottedPath - "section.key" 또는 "section.sub.key"
 * @param {*} value
 * @returns {boolean} 성공 여부
 */
function updateSetting(dottedPath, value) {
  if (!dottedPath || typeof dottedPath !== 'string') return false;
  const parts = dottedPath.split('.');
  if (parts.length === 0) return false;

  setByPath(userOverrides, parts, value);
  setByPath(mergedConfig, parts, value);

  return saveUserOverrides();
}

/**
 * 여러 키를 한 번에 갱신한다 (UI 저장 버튼 등).
 * @param {Record<string, *>} patches - { "tts.rate": 1.2, "movement.enabled": false }
 * @returns {boolean}
 */
function updateSettings(patches) {
  if (!isPlainObject(patches)) return false;
  for (const [dotted, value] of Object.entries(patches)) {
    const parts = dotted.split('.');
    setByPath(userOverrides, parts, value);
    setByPath(mergedConfig, parts, value);
  }
  return saveUserOverrides();
}

function setByPath(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * 사용자 오버라이드를 모두 제거하고 기본값으로 복귀한다.
 * @returns {object} 새 병합 설정
 */
function resetSettings() {
  userOverrides = {};
  saveUserOverrides();
  mergedConfig = loadDefaultConfig();
  return mergedConfig;
}

module.exports = {
  initSettings,
  getSettings,
  updateSetting,
  updateSettings,
  resetSettings,
  getUserSettingsPath,
};
