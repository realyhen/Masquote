# AI 데스크탑 마스코트 앱 개발 기술 조사 보고서

**Electron.js 기반 투명 오버레이 위에 캐릭터를 띄우고, 주기적으로 화면을 캡처해 Vision AI에 보낸 뒤, 한국어 한마디 반응을 TTS로 출력하는 데스크탑 마스코트 앱**은 현재 기술 스택으로 충분히 구현 가능하다. 핵심 제약은 Exclusive Fullscreen 위 표시 불가, 무료 API 일일 호출 한도(Gemini 250회/일), 그리고 Windows 11 투명 렌더링 버그 세 가지이며, 각각 실용적인 우회책이 존재한다. 이 보고서는 7개 기술 영역 전체를 코드 예시와 함께 정리하여 즉시 개발 계획에 활용할 수 있도록 구성했다.

---

## 1. Electron.js 투명 데스크탑 앱 구현

### 투명 창과 always-on-top 핵심 설정

Electron에서 투명 마스코트 창을 만들려면 `frame: false`와 `transparent: true`를 반드시 함께 사용해야 한다. **Windows에서 `transparent: true`는 `frame: false` 없이 동작하지 않는다**는 것이 공식 문서의 명시적 제약이다.

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createMascotWindow() {
  const win = new BrowserWindow({
    width: 300,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,        // 투명 창은 리사이즈 불가 (공식 제약)
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,       // Windows 리사이즈 핸들 아티팩트 제거
    roundedCorners: false,   // Windows 11 둥근 모서리 그림자 방지
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  // 최상위 레벨 설정 - 'screen-saver'가 가장 높은 z-order
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.loadFile('index.html');
  return win;
}
```

CSS에서도 반드시 배경을 투명하게 처리해야 한다:

```css
html, body {
  margin: 0;
  padding: 0;
  background-color: rgba(0, 0, 0, 0);
  overflow: hidden;
}
body { pointer-events: none; }
body * { pointer-events: all; }  /* 캐릭터 요소만 클릭 가능 */
```

### 클릭 통과(Click-through) 구현

투명 영역은 마우스 이벤트를 아래 창으로 통과시키고, 캐릭터 영역만 클릭 가능하게 만들어야 한다. Electron 7 이후 투명 픽셀 자동 클릭 통과가 제거되어 **`setIgnoreMouseEvents` API를 명시적으로 사용**해야 한다.

```javascript
// preload.js
const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  const mascot = document.getElementById('mascot');
  mascot.addEventListener('mouseenter', () => {
    ipcRenderer.send('set-ignore-mouse-events', false);
  });
  mascot.addEventListener('mouseleave', () => {
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  });
});

// main.js
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setIgnoreMouseEvents(ignore, options);
});
```

`forward: true` 옵션은 클릭 통과 상태에서도 `mousemove` 이벤트를 Chromium에 전달하여 `mouseenter`/`mouseleave` 감지를 가능하게 한다. 이 옵션은 **Windows와 macOS에서만 지원**되며 Linux에서는 동작하지 않는다.

### Windows 11 렌더링 버그와 해결책

Windows 11 환경에서 보고된 주요 버그는 다음과 같다:

| 버그 | 영향 버전 | 증상 | 해결책 |
|------|-----------|------|--------|
| 검은/회색 배경 (이슈 #40515) | Electron 22-27+ | 투명 대신 불투명 배경 표시 | `app.disableHardwareAcceleration()` 또는 창 크기를 화면보다 2px 작게 설정 |
| 모서리 그림자 아티팩트 (#46468) | Electron 35-36 | 투명 창에 둥근 모서리 그림자 | PR #46641로 수정됨, `roundedCorners: false` 설정 |
| 사각 모서리 점 (#48340) | Electron 38+ | 프레임리스 창에 사각형 아티팩트 | `app.disableHardwareAcceleration()` |
| DWM GPU 과다 사용 (#39895) | Electron 27 미만 | DirectComposition 불필요한 GPU 재그리기 | Electron 27+로 업그레이드 |

**권장 GPU 관련 설정:**

```javascript
// 안정성 우선 시 (CPU 렌더링 폴백)
app.disableHardwareAcceleration();

// 선택적 플래그
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('use-angle', 'd3d11');
```

`app.disableHardwareAcceleration()`은 모든 GPU 가속을 비활성화하므로 애니메이션 성능에 영향을 줄 수 있다. 마스코트 앱처럼 작은 창에서는 체감 차이가 미미하므로 **안정성을 위해 비활성화를 권장**한다.

### 풀스크린 앱 위 표시의 한계

**보더리스 윈도우 / Fullscreen Optimizations 게임** (Windows 10 1809+ 대부분의 최신 게임): `screen-saver` 레벨로 표시 **가능**하다. DWM이 창을 합성하므로 TOPMOST 창이 게임 위에 나타난다. 단, GSync/FreeSync가 깨지고 1프레임 지연이 추가된다.

**Exclusive Fullscreen 게임** (DirectX 레거시, 일부 구형 게임): 표시 **불가능**하다. 게임이 디스플레이 어댑터를 직접 점유하며 DWM이 중단되므로, DLL 인젝션 없이는 어떤 창도 표시할 수 없다. Steam, Discord 등은 게임 프로세스에 DLL을 주입하여 DirectX 렌더 파이프라인에 직접 그리는 방식을 사용하며, 이는 Electron으로 구현할 수 없다.

**실용적 결론:** 현대 대부분의 게임은 Fullscreen Optimizations가 적용되어 사실상 보더리스 윈도우로 동작하므로, `screen-saver` 레벨 설정으로 대부분의 상황을 커버할 수 있다.

---

## 2. 실시간 화면 캡처

### desktopCapturer API 사용법

Electron 17부터 `desktopCapturer.getSources`는 **메인 프로세스에서만 호출 가능**하다. 렌더러에서 직접 호출하면 에러가 발생하므로 반드시 IPC를 통해 통신해야 한다.

```javascript
// main.js - 스크린샷 캡처 + JPEG 압축 통합 핸들러
ipcMain.handle('CAPTURE_AND_COMPRESS', async (event, options = {}) => {
  const { maxWidth = 1280, maxHeight = 720, jpegQuality = 80 } = options;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  if (!sources.length) return null;

  let image = sources[0].thumbnail;

  // 리사이즈 (비율 유지)
  const size = image.getSize();
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  if (scale < 1) {
    image = image.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    });
  }

  const buffer = image.toJPEG(jpegQuality);
  return {
    base64: buffer.toString('base64'),
    mimeType: 'image/jpeg',
    sizeKB: Math.round(buffer.length / 1024),
  };
});
```

**알려진 제한 사항:**
- HDR 10비트 모니터에서 `IDXGIDuplicateOutput` 크래시 발생 (이슈 #18312)
- 일부 듀얼 모니터 환경에서 하나의 화면만 감지 (이슈 #22364)
- DPI 스케일링 혼합 환경에서 해상도 불일치 발생 가능
- **1초 간격 반복 캡처 시 메모리 누수**로 1시간 내 6GB+ 도달 후 크래시 보고 (이슈 #4738)

### 이미지 압축 최적화 전략

Vision AI API로 전송할 때 최적의 압축 설정:

| 시나리오 | 해상도 | 포맷 | 품질 | 예상 크기 | 비고 |
|---------|--------|------|------|----------|------|
| **일반 모니터링 (권장)** | 1280×720 | JPEG | 80% | 100-200KB | 충분한 디테일, 적은 토큰 비용 |
| 텍스트 중심 화면 | 1920×1080 | JPEG | 85% | 200-400KB | OCR 정확도 향상 |
| 빠른 개요 파악 | 512×512 | JPEG | 70% | 30-50KB | Gemini low detail 모드용 |

**WebP 포맷은 동일 품질 대비 JPEG보다 약 33% 작다.** 그러나 Electron의 NativeImage는 WebP 직접 출력을 지원하지 않으므로, 렌더러의 Canvas API를 통해 변환해야 한다. 실용적으로는 JPEG 80%면 충분하다.

### 캡처 주기와 성능 영향

| 주기 | CPU 영향 | 메모리 | 권장 용도 |
|------|---------|--------|----------|
| 1초 | 높음 (15-30%) | 누수 위험 | **비권장** |
| 5초 | 중간 (5-10%) | 관리 가능 | 최소 반응성 필요 시 |
| **10초** | **낮음 (2-5%)** | **안정적** | **일반 마스코트 권장** |
| 30초 | 미미 (<2%) | 무시 가능 | 백그라운드 모니터링 |

**핵심 최적화 기법 — 변화 감지로 불필요한 캡처 제거:**

```javascript
let lastImageHash = null;

async function captureIfChanged() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 640, height: 360 }, // 비교용 저해상도
  });
  if (!sources.length) return null;

  const buffer = sources[0].thumbnail.toJPEG(50);
  const quickHash = buffer.slice(0, 1024).toString('base64');

  if (quickHash === lastImageHash) return null; // 변화 없음
  lastImageHash = quickHash;

  // 변화 감지 시에만 고해상도 캡처
  const fullSources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
  });
  return fullSources[0].thumbnail.toJPEG(80);
}
```

### 보안 소프트웨어 충돌 대응

화면 캡처를 차단하는 주요 소프트웨어: **Safetica** (DWM 레벨 차단), **Forcepoint DLP** (정책 기반 차단), **Kaspersky** (화면 캡처 보호 기능), **SpyShelter** (모든 캡처 API 차단).

**대응 전략:**
1. **코드 서명 필수** — 미서명 Electron 앱은 SmartScreen 경고와 백신 오탐의 주 원인이다. EV/OV 인증서 또는 Azure Trusted Signing을 사용한다.
2. **캡처 실패 감지 및 우아한 실패 처리:**

```javascript
async function attemptCapture() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'], thumbnailSize: { width: 1280, height: 720 }
    });
    if (sources.length === 0) return { status: 'blocked', reason: 'no_sources' };
    if (sources[0].thumbnail.isEmpty()) return { status: 'blocked', reason: 'empty_image' };
    return { status: 'success', image: sources[0].thumbnail.toJPEG(80) };
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}
```

3. **사용자 안내** — 캡처 차단 감지 시 "보안 소프트웨어가 화면 캡처를 차단하고 있습니다" 메시지와 함께 허용 방법을 안내한다.

---

## 3. 무료 Vision AI API 비교 분석

### Gemini 2.5 Flash가 최적의 선택인 이유

**중요:** Gemini 2.0 Flash는 2026년 3월 3일 폐지되었다. 후속 모델인 **Gemini 2.5 Flash**가 동일한 무료 한도를 유지하며 더 나은 성능을 제공한다.

| 항목 | Gemini 2.5 Flash | Groq (Llama 4 Scout) |
|------|------------------|----------------------|
| **무료 RPD** | **250회/일** | 1,000회/일 |
| **무료 RPM** | 10회/분 | 30회/분 |
| **Vision 품질** | ⭐⭐⭐⭐⭐ 탁월 (네이티브 멀티모달) | ⭐⭐⭐⭐ 양호 |
| **한국어 품질** | ⭐⭐⭐⭐⭐ **네이티브 수준** | ⭐⭐ 공식 미지원 |
| **응답 속도** | 1-3초 | **<1초** (LPU 가속) |
| **이미지 크기** | 인라인 100MB | base64 4MB / URL 20MB |
| **최대 해상도** | 3072×3072 | 모델 의존 |
| **데이터 프라이버시** | 무료 티어 데이터 학습 활용 가능 | 학습 미활용 |

**Gemini 2.5 Flash Node.js 코드:**

```javascript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analyzeScreenshot(base64Image) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: '화면을 보고 마스코트로서 자연스러운 한마디 반응을 해줘.' },
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
    ]
  });
  return response.text;
}
```

**Groq Llama 4 Scout 코드 (폴백용):**

```javascript
import Groq from 'groq-sdk';
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function analyzeWithGroq(base64Image) {
  const completion = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this screenshot briefly.' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
      ]
    }],
    max_completion_tokens: 100,
  });
  return completion.choices[0].message.content;
}
```

### 실사용 기준 추천 전략

**주력 API: Gemini 2.5 Flash**를 사용한다. 한국어 품질이 압도적이고, 250회/일은 8시간 작업 기준 **약 2분에 1회 분석**이 가능한 수준이다. 스크린샷을 1280×720 JPEG로 압축하면 이미지당 토큰 비용도 770~1,290 토큰으로 적당하다.

**폴백 API: Groq Llama 4 Scout**는 Gemini 429 에러 시 사용한다. 1,000회/일로 더 넉넉하고 응답이 1초 이내로 빠르지만, **한국어가 공식 지원 언어가 아니므로** 응답 품질이 크게 떨어진다. 영어 프롬프트를 사용하고 한국어로 번역하는 2단계 방식을 고려할 수 있다.

**비용 참고:** OpenAI와 Anthropic은 무료 API 티어를 제공하지 않아 이 프로젝트에는 부적합하다. Hugging Face Inference API는 무료이나 불안정하고 Vision 품질이 낮다.

---

## 4. 캐릭터 애니메이션 구현

### Lottie 애니메이션 Electron 적용

**lottie-web** 라이브러리가 가장 성숙하고 안정적이다. SVG 렌더러는 작은 캐릭터 애니메이션에 적합하며, Canvas 렌더러는 복잡한 레이어가 많을 때 유리하다.

```javascript
import lottie from 'lottie-web';

const anim = lottie.loadAnimation({
  container: document.getElementById('mascot-container'),
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: './animations/idle.json'
});

// 프레임 구간 재생 (상태별 구간 분리 가능)
anim.playSegments([0, 60], true);  // 0~60 프레임만 재생
anim.goToAndPlay(30, true);        // 30번 프레임부터 재생
anim.setSpeed(1.5);                // 속도 조절
```

### 상태 기반 애니메이션 전환

대기/말하기/이동 상태를 관리하는 간단한 상태 머신 패턴:

```javascript
class MascotAnimationController {
  constructor(container) {
    this.container = container;
    this.states = {
      idle:     { path: './animations/idle.json', loop: true },
      speaking: { path: './animations/speaking.json', loop: true },
      moving:   { path: './animations/walking.json', loop: true },
    };
    this.currentState = 'idle';
    this.animation = null;
    this._loadState('idle');
  }

  transition(event) {
    const transitions = {
      idle:     { SPEAK: 'speaking', MOVE: 'moving' },
      speaking: { DONE: 'idle', MOVE: 'moving' },
      moving:   { STOP: 'idle', SPEAK: 'speaking' },
    };
    const next = transitions[this.currentState]?.[event];
    if (!next || next === this.currentState) return;
    this.currentState = next;
    this._loadState(next);
  }

  _loadState(state) {
    if (this.animation) this.animation.destroy();
    this.animation = lottie.loadAnimation({
      container: this.container,
      renderer: 'svg',
      loop: this.states[state].loop,
      autoplay: true,
      path: this.states[state].path,
    });
  }
}
```

**부드러운 전환 팁:** 모든 상태 애니메이션을 하나의 Lottie JSON에 프레임 구간별로 넣고 `playSegments()`로 전환하면 로딩 없이 즉각 전환이 가능하다.

### 무료 캐릭터 에셋 소스

| 소스 | 라이선스 | 특징 |
|------|---------|------|
| **LottieFiles Free** | Lottie Simple License (상업적 사용 가능) | "mascot", "character" 검색 시 수백 개 에셋 |
| **Kenney.nl** | **CC0 (퍼블릭 도메인)** | 40,000+ 게임 에셋, 상업적 자유 사용 |
| **itch.io Free Sprites** | CC0/CC-BY 다수 | "desktop pet sprites" 검색, 픽셀아트 풍부 |
| **OpenGameArt** | CC0/CC-BY/CC-BY-SA | 캐릭터 스프라이트 시트 다수 |

### 캐릭터 이동 로직

```javascript
// main.js - 화면 하단 경계를 따라 이동
const { screen } = require('electron');

class MascotMovement {
  constructor(win) {
    this.win = win;
    this.velocityX = 2;
    this.moveInterval = null;
  }

  startWalk() {
    this.velocityX = (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random() * 2);
    this.moveInterval = setInterval(() => {
      const bounds = screen.getPrimaryDisplay().workArea; // 태스크바 제외 영역
      const pos = this.win.getBounds();
      let newX = pos.x + this.velocityX;

      // 좌우 경계 충돌 시 방향 반전
      if (newX <= bounds.x) {
        newX = bounds.x;
        this.velocityX = Math.abs(this.velocityX);
      }
      if (newX + pos.width >= bounds.x + bounds.width) {
        newX = bounds.x + bounds.width - pos.width;
        this.velocityX = -Math.abs(this.velocityX);
      }

      // Y좌표를 workArea 하단에 고정 (태스크바 위를 걸어다니는 효과)
      const bottomY = bounds.y + bounds.height - pos.height;
      this.win.setBounds({ x: Math.round(newX), y: bottomY, width: pos.width, height: pos.height });
    }, 16); // ~60fps
  }

  stop() { clearInterval(this.moveInterval); }
}
```

`screen.getPrimaryDisplay().workArea`는 태스크바를 제외한 작업 영역을 반환하므로, 캐릭터가 태스크바 위 가장자리를 걸어다니는 자연스러운 동작을 구현할 수 있다.

---

## 5. TTS 음성 출력

### Web Speech API 한국어 현실

Electron은 Chromium 기반이므로 `speechSynthesis` API를 사용할 수 있다. Windows 10/11에서 기본 제공되는 한국어 음성은 **"Microsoft Heami"** (ko-KR, 여성)이다.

```javascript
async function speakKorean(text) {
  const voices = speechSynthesis.getVoices();
  const koreanVoice = voices.find(v => v.lang.startsWith('ko'));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = koreanVoice;
  utterance.lang = 'ko-KR';
  utterance.rate = 1.0;
  return new Promise(resolve => {
    utterance.onend = resolve;
    speechSynthesis.speak(utterance);
  });
}
```

**품질 평가:** Microsoft Heami는 기능적이지만 **로봇 같은 음질**이다. 자연스러운 대화 느낌에는 부족하지만, 무료이고 오프라인 동작하며 지연이 없다는 장점이 있다. MVP 단계에서는 충분하고, 이후 ElevenLabs로 업그레이드하는 전략이 합리적이다.

### ElevenLabs 무료 플랜의 실사용 한계

**무료 한도: 월 10,000 크레딧** (≈ 10,000자 또는 약 10분 음성). 한국어 한마디 반응이 평균 20~30자라면, **월 약 330~500회 TTS 호출**이 가능하다. 하루 기준 약 11~17회로, 일상적 사용에는 부족하다. 상업적 라이선스도 포함되지 않는다.

**한국어는 지원한다.** Flash v2.5 모델은 75ms 지연으로 실시간 사용에 적합하며, Eleven v3는 70+ 언어를 지원한다.

**권장:** MVP는 Web Speech API로 시작하고, 사용자 반응이 좋으면 ElevenLabs Starter ($5/월, 30,000 크레딧)로 업그레이드한다.

### TTS 큐 관리로 분석 요청 충돌 방지

TTS 재생과 AI 분석을 분리하는 이벤트 기반 큐 시스템:

```javascript
class TTSQueueManager {
  constructor() {
    this.queue = [];
    this.isPlaying = false;
  }

  enqueue(text, priority = 'normal') {
    if (priority === 'high') {
      speechSynthesis.cancel();
      this.queue = [];
      this.isPlaying = false;
    }
    this.queue.push({ text, priority });
    this._processQueue();
  }

  async _processQueue() {
    if (this.isPlaying || this.queue.length === 0) return;
    this.isPlaying = true;
    const item = this.queue.shift();

    await new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = 'ko-KR';
      utterance.onend = resolve;
      utterance.onerror = reject;
      speechSynthesis.speak(utterance);
    });

    this.isPlaying = false;
    this._processQueue(); // 다음 항목 처리
  }
}
```

**핵심 원칙:** AI 분석과 TTS는 **완전히 비동기로 분리**한다. 분석 결과가 도착하면 큐에 넣고, 이전 음성 재생이 끝난 후 자동으로 다음을 재생한다. 긴급 메시지는 `priority: 'high'`로 현재 재생을 중단하고 즉시 처리한다.

---

## 6. 프롬프트 설계 전략

### 화면 컨텍스트를 전달하는 최적 구조

**텍스트 지시를 이미지 앞에 배치**하면 모델이 무엇을 관찰해야 하는지 사전에 인지하여 분석 정확도가 향상된다. 활성 창 제목, 시각, 이전 반응 이력 등 메타데이터를 함께 전달하면 맥락 인지 품질이 크게 높아진다.

### 짧고 자연스러운 한마디 유도 프롬프트

토스 기술팀의 실사례에서 발견된 핵심: **"실제 만나서 대화하는 것처럼 자연스럽게 말해달라"** 라는 단일 지시가 모델의 한국어 구어체 품질을 극적으로 향상시켰다. "음", "아", "헐" 같은 추임새가 자연스럽게 생성된다.

**권장 시스템 프롬프트 (실전용):**

```
너는 '모코'야. 사용자의 데스크탑 화면 구석에 사는 귀여운 AI 마스코트야.

## 핵심 규칙
- 한국어 반말, 1문장 최대 40자
- 자연스러운 구어체 (추임새 OK: 음, 아, 헐, 와)
- 화면을 설명하지 마. 감정적 반응만 해
- 이전 반응과 겹치는 표현 금지

## 반응 유형 (돌아가며)
- 감탄: "오 집중력 미쳤다 🔥"
- 질문: "그거 재밌어?"  
- 걱정: "눈 안 아파? 좀 쉬어~"
- 유머: "나도 같이 보고 싶다 ㅋㅋ"
- 감성: "이 시간에 일하는 너... 멋있어 ✨"
```

**유저 메시지 구조:**

```
<context>
시각: {time} | 창: {window_title} | 상태: {user_state}
</context>
<ban_phrases>{최근_3개_반응}</ban_phrases>
<style_hint>{랜덤_스타일}</style_hint>  // "장난스럽게", "따뜻하게" 등

[스크린샷 첨부]

모코의 반응:
```

### 반복 방지 핵심 기법

**파라미터 설정:** Temperature **0.8**, Top-p **0.9**, Presence penalty **0.6**, Frequency penalty **0.4**, Max tokens **60**

**실행 전략 3가지:**
1. **슬라이딩 윈도우** — 최근 5개 반응을 `ban_phrases`로 전달하여 동일 표현 차단
2. **랜덤 스타일 힌트** — 매 요청마다 "장난스럽게", "감성적으로", "걱정하면서" 등을 랜덤 주입하여 톤 다양성 확보
3. **프롬프트 템플릿 로테이션** — 3~5개의 시스템 프롬프트 변형을 번갈아 사용

### 트리거 설계: 하이브리드 방식 권장

순수 주기적 분석은 API 낭비가 크고, 순수 사용자 호출은 "살아있는 느낌"을 잃는다. **하이브리드 방식**이 최적이다:

| 트리거 티어 | 조건 | 동작 |
|-----------|------|------|
| **Tier 1 - 화면 변화** | 스크린샷 해시 차이 임계값 초과 | 5초 내 분석 (최소 45초 쿨다운) |
| **Tier 2 - 앱 전환** | 활성 창 제목 변경 | 3초 후 분석 |
| **Tier 3 - 주기적** | 3~5분간 반응 없음 + 화면 변화 있음 | 아이들 반응 |
| **Tier 4 - 사용자 호출** | Ctrl+Shift+M 또는 캐릭터 클릭 | 즉시 분석 |
| **Tier 5 - 수면** | 10분 이상 미사용 | API 호출 중단, 수면 애니메이션 |

**예산 보호:** 시간당 최대 60회, 일일 최대 250회 (Gemini 무료 한도) 하드캡을 설정한다.

---

## 7. 전체 아키텍처 및 개발 로드맵

### 시스템 전체 흐름도

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ Screen       │───▶│ Image        │───▶│ AI API    │  │
│  │ Capturer     │    │ Compressor   │    │ Client    │  │
│  │ (10s 주기 +  │    │ (1280x720    │    │ (Gemini   │  │
│  │  변화감지)   │    │  JPEG 80%)   │    │  + Groq   │  │
│  └──────────────┘    └──────────────┘    │  폴백)    │  │
│                                          └─────┬─────┘  │
│                                                │        │
│  ┌──────────────┐    ┌──────────────┐    ┌─────▼─────┐  │
│  │ Window       │◀───│ Movement     │    │ Response  │  │
│  │ Manager      │    │ Controller   │    │ Router    │  │
│  │ (투명/OnTop) │    │ (경계처리)   │    └─────┬─────┘  │
│  └──────────────┘    └──────────────┘          │        │
│         ▲                                      │        │
│         │              IPC Bridge               │        │
├─────────┼──────────────────────────────────────┼────────┤
│         │        Electron Renderer Process      │        │
│         │                                      ▼        │
│  ┌──────┴───────┐    ┌──────────────┐    ┌───────────┐  │
│  │ Lottie       │◀───│ Animation    │◀───│ TTS Queue │  │
│  │ Renderer     │    │ State Machine│    │ Manager   │  │
│  │ (캐릭터표시) │    │ (idle/speak/ │    │ (Web      │  │
│  └──────────────┘    │  move)       │    │  Speech)  │  │
│                      └──────────────┘    └───────────┘  │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ Prompt       │    │ Trigger      │                   │
│  │ Manager      │    │ Controller   │                   │
│  │ (템플릿회전  │    │ (하이브리드  │                   │
│  │  +반복방지)  │    │  트리거)     │                   │
│  └──────────────┘    └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### 단계별 개발 순서 (MVP 우선순위)

**Phase 1 — 기본 골격 (1~2주)**
투명 오버레이 창 생성, 정적 캐릭터 이미지 표시, 클릭 통과 처리, 드래그 이동. 이 단계에서 Windows 11 렌더링 버그를 조기에 발견하고 해결한다.

**Phase 2 — 화면 캡처 + AI 연동 (1~2주)**
desktopCapturer로 스크린샷 캡처, JPEG 압축 파이프라인 구축, Gemini API 연동, 텍스트 말풍선으로 AI 반응 표시. 이 단계가 핵심 가치 검증(PoC) 포인트다.

**Phase 3 — 캐릭터 애니메이션 (1주)**
Lottie 애니메이션 적용, idle/speaking/moving 상태 머신, 화면 하단 걸어다니기 구현.

**Phase 4 — TTS + 트리거 고도화 (1주)**
Web Speech API 한국어 TTS 연동, TTS 큐 시스템, 변화 감지 기반 하이브리드 트리거, 프롬프트 로테이션 시스템.

**Phase 5 — 폴리싱 (1~2주)**
설정 UI (API 키, 캡처 주기, 캐릭터 선택), 시스템 트레이 아이콘, 자동 시작, Groq 폴백, 에러 처리/로깅 강화, Windows 설치 패키지 빌드.

### 예상 개발 기간

**1인 개발 기준 총 5~8주.** Phase 2까지의 MVP는 **2~4주**면 동작하는 프로토타입을 확인할 수 있다. Electron과 API 연동 경험이 있다면 하한에 가깝고, 처음이라면 상한에 가까울 것이다.

### 주요 리스크와 대응 방안

| 리스크 | 심각도 | 대응 방안 |
|--------|--------|----------|
| **Gemini 무료 한도 추가 삭감** | 높음 | Groq 폴백 구현, Flash-Lite (1,000RPD) 병행, 변화 감지로 불필요 호출 최소화 |
| **Windows 11 투명 렌더링 불안정** | 중간 | `disableHardwareAcceleration()` 기본 적용, 사용자 GPU 드라이버 업데이트 안내 |
| **보안 소프트웨어 캡처 차단** | 중간 | 코드 서명 적용, 캡처 실패 감지/안내 UI, 수동 텍스트 입력 폴백 모드 |
| **1초 캡처 메모리 누수** | 높음 | 10초+ 주기 사용, NativeImage 즉시 변환 후 참조 해제, 변화 감지 도입 |
| **한국어 TTS 음질 불만** | 낮음 | MVP는 Web Speech API, 추후 ElevenLabs Flash v2.5 업그레이드 경로 확보 |
| **AI 반응 반복/진부함** | 중간 | Temperature 0.8, 반응 이력 ban list, 스타일 힌트 랜덤 주입, 템플릿 로테이션 |

이 보고서의 코드 예시와 설정값은 모두 Electron v28+ / Windows 10/11 환경을 기준으로 하며, 실제 프로젝트에 직접 적용할 수 있는 수준으로 작성되었다. MVP 개발 시 Phase 1~2를 집중적으로 진행하여 핵심 가치를 빠르게 검증한 뒤, 사용자 피드백에 따라 후속 Phase를 조정하는 것을 권장한다.
