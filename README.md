# cre8

QR로 접속한 모바일 입력 화면과 메인 모니터 수신 화면을 분리한 자기소개 웹입니다.

## 화면

- `/screen` 메인 모니터 수신 화면
- `/join` 모바일 입력 화면
- `/` `/screen`으로 이동

## Supabase

`.env.local`에 아래 값을 설정합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

새 프로젝트에는 `supabase/migrations/001_participants.sql`을 먼저 적용합니다. 키가 없으면 개발 중에는 서버 메모리 저장소를 사용합니다.

## 실행

```bash
npm run dev
```
