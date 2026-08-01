# P0 보안 패치 (전체점검 260703 후속) — 2026-07-04

> SoT. 발견 근거·전체 조치목록: [`ai-docs/TEST/inspection_260703.md`](../../TEST/inspection_260703.md) §3 P0.
> Plane/Notion 미러: 미생성 (세션 중 doil-services MCP 미연결 — 다음 세션에서 등록 권장).

## 목적

점검에서 확인된 무인증/명의도용 엔드포인트 7건(S-1~S-7)을 닫는다. 인증 모델 자체(X-User-Id 자기신고)의 근본 교체는 **SGR-B2 세션토큰** 스코프로 분리 — sessionToken이 bcrypt 해시 대조 방식이라 요청단 검증은 세션 테이블/JWT 도입이 선행돼야 함(이번 조사로 확정).

## 적용 내역 (전부 코드 DONE · dev 반영 · 스모크 통과)

| ID | 위치 | 조치 | 스모크 |
|---|---|---|---|
| S-1 | `users.py` DELETE /users/me | `verify_user_session` + `_require_self` | 무헤더 419 / 타인 403 ✅ |
| S-2 | `users.py` invest_skill | 동일 | 무헤더 419 ✅ |
| S-2+ | `users.py` /me/export | 동일 (전화번호 포함 PII 덤프 — 점검 누락분 추가 발견) | 타인 403 / 본인 200 ✅ |
| S-3 | `admin.py:60` | JWT 시크릿 폴백 제거, 미설정 시 기동 거부(RuntimeError) | BFF 정상 기동 ✅ |
| S-3+ | `docker-compose.yml` | `ADMIN_JWT_SECRET`·`WIKI_AUTH_PASS` 기본값 → `:?` fail-fast | `compose config` OK ✅ |
| S-4 | `useUserStore.ts` | persist `partialize`로 passcode 제외 (유일 소비처 = [DBG] 퀘스트 강제완료 — 재시작 후 그 기능만 영향) | tsc/eslint 0 ✅ |
| S-5 | `feed.py`(작성·댓글), `market.py`(등록) | `body.user_id/seller_id != 세션` → 403 | 타인 명의 403 ✅ |
| S-6 | `ride.py` submit_ride | 세션 대조 + `uq.user_id` 소유권 + `uq.quest_id ↔ body.quest_id` 정합(저보상 uq에 고보상 quest 결합 차단) | — (기존 정상 경로 무변) |
| S-7 | `contents.py` upload | 세션 필수, `owner_type=user` 강제(system 403), owner_id=세션 uid 강제, 15MB 상한(read cap) | 무헤더 419 / system 403 ✅ |
| S-7+ | `nginx default.conf` | `client_max_body_size 0`(무제한) → `25m` | nginx 재시작 200 ✅ |

### 부수 발견·수정 (export 스모크 중 노출된 선재 버그 2건)

- `models.py` quest_status enum에 **EXPIRED 누락** — 엔진 expire 잡이 실제 기록하는 값이라, EXPIRED 행(45건 존재)을 걷는 조회가 LookupError 500. enum에 추가.
- `users.py:303` export가 `UserBadge.earned_at`(비존재 속성) 참조 → 배지 보유 유저 export AttributeError. `acquired_at`으로 교정(JSON 키는 유지).

## 검증

ruff 0 / tsc 0 / eslint 0 / BFF --reload 반영 / 스모크 10케이스 상기 표 / nginx·frontend 재기동.

## 잔여 / 후속

1. **클라 영향 확인(시각검증)**: 피드 작성·마켓 등록·업로드·스킬 투자 — 프론트는 항상 본인 id를 보내므로 무영향 설계이나 실화면 1회 확인 권장.
2. **운영 배포 시**: compose `:?` 때문에 운영 `.env`에 두 키 필수(이미 있음 — runbook 확인). nginx conf 반영 필요.
3. **SGR-B2 후속(근본)**: 요청단 세션토큰 검증(세션 테이블 or JWT) — X-User-Id 자기신고는 여전히 UUID를 아는 공격자에게 취약. 이번 패치는 "무인증"과 "명의 불일치"만 닫음.
4. P1(워커 격리 E-1 등)은 handoff ③.
