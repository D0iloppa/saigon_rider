# 기능 점검 체크리스트 — 섹션 인덱스

> 진척도(휘발성): [`../progress.md`](../progress.md) · 이슈 로그: [`../issues.md`](../issues.md) · 규칙: [`agent-guidelines.md`](../../agent-guidelines.md)

## 섹션

| 섹션 | 내용 |
|---|---|
| [§0 점검 절차](s0_setup.md) | 인프라 기동·헬스체크 절차 |
| [§1 화면 라우팅](s1_routing.md) | URL → 컴포넌트 매핑 |
| [§2 화면별 기능](s2_features.md) | 화면별 기능 × 엔드포인트 × 점검 방법 |
| [§3 엔진 (SRE)](s3_engine.md) | Engine API/서비스/배치/SQL 정합성 |
| [§4 시스템 전반](s4_system.md) | E2E 인프라·인증·라우팅·연계 |
| [§6 부록](s6_appendix.md) | 빠른 진단 명령 모음 |
| §5 이슈 로그 → [`issues.md`](../issues.md) | ❌/🟡 항목 상세 |

## 사용 규칙

- 항목 상태 갱신: `⬜ → 🟡/✅/❌/⛔`
- ❌ 발견 시 [`issues.md`](../issues.md) 표에 행 추가
- 섹션 진척 변동 시 [`progress.md`](../progress.md) 갱신
- 큰 변경 후 `./wikidoc_publish.sh` 실행
