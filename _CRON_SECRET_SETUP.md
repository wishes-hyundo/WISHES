# 🔐 Vercel CRON_SECRET 추가 안내 (사용자가 한가할 때 1번만)

## 페이지 (이미 Chrome 에 열려있음)

```
https://vercel.com/wishes/wishes/settings/environment-variables
```

## 클릭 순서 (30초)

1. **Add New** 버튼 클릭 (우측 상단)
2. **Key (Name)**: 아래 그대로 복사·붙여넣기
   ```
   CRON_SECRET
   ```
3. **Value**: 아래 그대로 복사·붙여넣기 (이미 생성된 안전 랜덤)
   ```
   c8dffa09f8228452fcf813a9e1d844795583431fe7695cf48faf09a8ce00d70f
   ```
4. **Environments**: Production / Preview / Development **모두 체크** (기본)
5. **Save** 클릭

## 추가 후 확인 (Vercel 자동 재배포 ~2분)

배포 완료 후, 매 30분마다 Vercel cron 이 자동 호출 시작.

**즉시 검증 (배포 후):**
```
https://wishes.co.kr/api/cron/backfill-building-info?secret=c8dffa09f8228452fcf813a9e1d844795583431fe7695cf48faf09a8ce00d70f&limit=5&dry_run=true
```

응답 예:
```json
{
  "ok": true,
  "total_targets": 5,
  "success": 0,
  "no_kakao": 0,
  "no_building": 0,
  "error": 0,
  "dry_run": true,
  "samples": [
    { "id": 12345, "address": "서울 강남구 ...", "extracted": { "building_name": "...", "built_year": "2020" } }
  ]
}
```

## ⚠️ 주의

- 위 secret 값은 외부에 공유 금지 (Vercel cron 인증용)
- 변경 가능: 그냥 다른 랜덤값으로 Save 후 같은 값을 cron 호출 시 secret 으로 쓰면 됨
- 새로 생성하려면: PowerShell 에서 `[guid]::NewGuid().ToString("N") * 2`

작성: 2026-04-27 v3 세션
