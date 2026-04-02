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
- [ ] Phase 2: 화면 캡처 + Gemini API 연동 + 말풍선 텍스트 표시
- [ ] Phase 3: Lottie 애니메이션 + 상태 머신 + 화면 하단 걸어다니기
- [ ] Phase 4: TTS + 큐 시스템 + 하이브리드 트리거 + 프롬프트 로테이션
- [ ] Phase 5: 설정 UI + 시스템 트레이 + 자동 시작 + Groq 폴백 + 에러 처리

## Phase 1 기능

- 투명 배경 + 프레임 없는 always-on-top 윈도우
- Windows 11 투명 렌더링 버그 대응 (GPU 가속 비활성화)
- 투명 영역 클릭 통과 (캐릭터만 클릭 가능)
- 마우스 드래그로 캐릭터 위치 이동
- SVG 기반 정적 캐릭터 (모코) 표시
- 시작 시 인사 말풍선 표시
