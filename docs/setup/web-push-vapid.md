# Web Push VAPID 키 등록 가이드 (PR-N-2)

> **대상**: 사장님 (wishes@wishes.co.kr)
> **소요 시간**: 5분
> **비용**: 0원

---

## 1. 왜 필요?

PR-N-1 (#26) 이 Service Worker + push handler 인프라 구축 완료.
**VAPID 키 (Voluntary Application Server Identification)** 가 있어야 Push 서비스 (Chrome / Firefox / Edge) 가 우리 서버를 인증.

---

## 2. VAPID 키 생성 (사장님 직접)

### 옵션 A — 로컬 터미널 (권장)
```bash
# Node.js 20+ 필요
npx web-push generate-vapid-keys
```

출력 예시:
```
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U

Private Key:
UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
```

### 옵션 B — 온라인 생성
https://vapidkeys.com (브라우저에서 생성, 서버에 업로드 X)

---

## 3. Vercel 환경변수 등록

### 3.1 Vercel Dashboard
1. https://vercel.com/wishes-hyundo/wishes-v2 접속
2. Settings → Environment Variables
3. 추가:
   - `VAPID_PUBLIC_KEY` = (Public Key 위에서 복사)
   - `VAPID_PRIVATE_KEY` = (Private Key 위에서 복사)
   - `VAPID_SUBJECT` = `mailto:wishes@wishes.co.kr`
4. Apply to: Production / Preview / Development 모두 체크
5. Save

### 3.2 .env.local (로컬 테스트용, 선택)
```bash
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U
VAPID_PRIVATE_KEY=UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
VAPID_SUBJECT=mailto:wishes@wishes.co.kr
```

⚠️ **`.env.local` 은 git push X** (`.gitignore` 에 이미 등록됨)

---

## 4. 검증 (등록 후)

### 4.1 Vercel 재배포
환경변수 등록 후 자동 재배포 트리거 (또는 Deployments → Redeploy 수동).

### 4.2 console 확인
배포 완료 후 https://wishes.co.kr 접속 → DevTools Console:
```js
// 정상이면:
[wishes-push] VAPID configured
```

### 4.3 테스트 알림 (사장님 admin)
1. https://wishes.co.kr/admin/test-push 접속
2. "테스트 알림 발송" 클릭
3. 5초 내 푸시 알림 수신 (Chrome / Firefox / Edge)

iOS Safari 16.4+ 도 푸시 지원, 16.3 이하는 자동 fallback (이메일).

---

## 5. 보안 (절대 외부 노출 X)

### 금지
- ❌ Public Key 는 노출 OK (브라우저에 전달)
- ❌ **Private Key 절대 git / 채팅 / 이메일 X**
- ❌ Vercel 환경변수 외부 다른 곳 X

### 만약 Private Key 유출 시
1. 즉시 Vercel 환경변수에서 삭제
2. 새 VAPID 키 쌍 재생성 (옵션 A/B 다시)
3. Vercel 재배포 (10분 내)
4. 기존 사용자 푸시 구독은 자동 무효화 (재구독 필요)

---

## 6. 후속

VAPID 등록 완료 후:
- **PR-N-2** 코드 작업 진행 (web-push npm + 알림 dispatcher)
- **PR-N-4** UI 푸시 동의 모달 (RFC 0015 사장님 승인 후)

---

작성: 2026-05-01
