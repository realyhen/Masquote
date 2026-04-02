/**
 * 화면 캡처 모듈
 *
 * 역할: desktopCapturer를 사용하여 화면을 캡처하고,
 *       JPEG 압축 및 변화 감지를 수행한다.
 *       메모리 누수 방지를 위해 NativeImage 참조를 즉시 해제한다.
 */

const { desktopCapturer } = require('electron');

/** 변화 감지용 이전 이미지 해시 */
let lastImageHash = null;

/**
 * 화면을 캡처하고 JPEG로 압축하여 반환한다.
 * NativeImage → Buffer 변환 후 즉시 참조를 해제하여 메모리 누수를 방지한다.
 *
 * @param {object} options - 캡처 옵션
 * @param {number} [options.maxWidth=1280] - 최대 가로 해상도
 * @param {number} [options.maxHeight=720] - 최대 세로 해상도
 * @param {number} [options.quality=80] - JPEG 압축 품질 (0-100)
 * @returns {Promise<{base64: string, mimeType: string, sizeKB: number}|null>} 캡처 결과 또는 null
 */
async function captureScreen(options = {}) {
  const { maxWidth = 1280, maxHeight = 720, quality = 80 } = options;

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (!sources || sources.length === 0) {
      console.warn('[Capturer] 캡처 소스를 찾을 수 없습니다.');
      return null;
    }

    let image = sources[0].thumbnail;

    // 빈 이미지 체크 (보안 소프트웨어 차단 대응)
    if (image.isEmpty()) {
      console.warn('[Capturer] 캡처된 이미지가 비어있습니다. 보안 소프트웨어가 차단 중일 수 있습니다.');
      return null;
    }

    // 비율 유지 리사이즈 (업스케일링 방지)
    const size = image.getSize();
    const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
    if (scale < 1) {
      image = image.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
      });
    }

    // JPEG 변환 후 NativeImage 참조 즉시 해제
    const buffer = image.toJPEG(quality);
    image = null;

    return {
      base64: buffer.toString('base64'),
      mimeType: 'image/jpeg',
      sizeKB: Math.round(buffer.length / 1024),
    };
  } catch (err) {
    console.error('[Capturer] 화면 캡처 오류:', err.message);
    return null;
  }
}

/**
 * 화면 변화를 감지한다.
 * 저해상도 캡처의 앞부분 바이트를 해시로 비교하여 변화 여부를 판단한다.
 * 변화가 감지되면 고해상도 캡처 결과를 반환하고, 없으면 null을 반환한다.
 *
 * @param {object} comparisonOpts - 변화 비교용 저해상도 캡처 옵션
 * @param {number} [comparisonOpts.width=640] - 비교용 가로 해상도
 * @param {number} [comparisonOpts.height=360] - 비교용 세로 해상도
 * @param {number} [comparisonOpts.quality=50] - 비교용 JPEG 품질
 * @param {object} analysisOpts - 변화 감지 시 고해상도 캡처 옵션
 * @returns {Promise<{base64: string, mimeType: string, sizeKB: number}|null>} 변화 시 캡처 결과, 없으면 null
 */
async function captureIfChanged(comparisonOpts = {}, analysisOpts = {}) {
  const { width = 640, height = 360, quality = 50 } = comparisonOpts;

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    if (!sources || sources.length === 0 || sources[0].thumbnail.isEmpty()) {
      return null;
    }

    // 저해상도 이미지의 앞부분 바이트로 빠른 해시 비교
    const buffer = sources[0].thumbnail.toJPEG(quality);
    const quickHash = buffer.slice(0, 1024).toString('base64');

    if (quickHash === lastImageHash) {
      return null; // 변화 없음
    }

    lastImageHash = quickHash;

    // 변화 감지 시 고해상도 캡처
    return await captureScreen(analysisOpts);
  } catch (err) {
    console.error('[Capturer] 변화 감지 캡처 오류:', err.message);
    return null;
  }
}

/**
 * 변화 감지 해시를 초기화한다.
 * 강제로 다음 캡처를 변화로 인식하게 한다.
 */
function resetChangeDetection() {
  lastImageHash = null;
}

module.exports = { captureScreen, captureIfChanged, resetChangeDetection };
