# Masquote - AI 데스크탑 마스코트

화면을 보고 한마디 하는 귀여운 AI 데스크탑 마스코트 앱.

## 기술 스택

- **플랫폼**: Windows 10/11
- **런타임**: Electron.js
- **AI Vision**: Google Gemini 2.5 Flash (무료 티어)
- **AI 폴백**: Groq Llama 4 Scout
- **TTS**: Web Speech API (ko-KR)
- **캐릭터 애니메이션**: lottie-web
- **언어**: JavaScript

## 설치

```bash
npm install
```

## 실행

```bash
npm start
```

## 설정

1. `.env.example`을 `.env`로 복사
2. API 키 입력:
   ```
   GEMINI_API_KEY=your_key_here
   GROQ_API_KEY=your_key_here
   ```

## 개발 현황

- [x] **Phase 1**: 투명 창 + 클릭 통과 + 정적 캐릭터 표시 + 드래그 이동
- [x] **Phase 2**: 화면 캡처 + Gemini API 연동 + 말풍선 텍스트 표시
- [x] **Phase 3**: CSS 애니메이션 + 상태 머신 + 화면 하단 걸어다니기
- [ ] Phase 4: TTS + 큐 시스템 + 하이브리드 트리거 + 프롬프트 로테이션
- [ ] Phase 5: 설정 UI + 시스템 트레이 + 자동 시작 + Groq 폴백 + 에러 처리

## Phase 1 기능

- 투명 배경 + 프레임 없는 always-on-top 윈도우
- Windows 11 투명 렌더링 버그 대응 (GPU 가속 비활성화)
- 투명 영역 클릭 통과 (캐릭터만 클릭 가능)
- 마우스 드래그로 캐릭터 위치 이동
- SVG 기반 정적 캐릭터 (모코) 표시
- 시작 시 인사 말풍선 표시

## Phase 2 기능

- desktopCapturer로 화면 스크린샷 캡처 (JPEG 1280×720 80%)
- 변화 감지 — 저해상도 해시 비교로 불필요한 캡처 제거
- 캡처 실패 감지 (보안 소프트웨어 차단 대응)
- NativeImage 즉시 변환 후 참조 해제 (메모리 누수 방지)
- Gemini 2.5 Flash API 연동 — 스크린샷 분석 + 한국어 한마디 생성
- 일일/시간당 API 사용량 카운터 (하드캡 보호)
- 429/403 에러 시 사용자 친화적 메시지
- 캐릭터 클릭 시 화면 분석 트리거 (드래그와 구분)
- 타이핑 효과 말풍선 (글자 단위 애니메이션)
- 분석 중 "화면 보는 중..." 피드백

## Phase 3 기능

- CSS keyframe 애니메이션 3종 (idle-bob, walk-bounce, speaking-bounce)
- 상태 머신: idle → walking → speaking 전환 + CSS 클래스 자동 제어
- 화면 하단 걸어다니기 — 윈도우 자체를 좌우로 이동 (setBounds)
- 화면 끝 도달 시 방향 전환 + 캐릭터 좌우 반전
- 걷기 주기: 8초 대기 → 5초 걷기 반복
- 걷기 중 클릭 시 즉시 정지 → 분석 → 완료 후 걷기 재개
