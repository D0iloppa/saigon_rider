# 워크플로우 — Docusaurus 위키 현행화

> **발행 명령**: 프로젝트 루트에서 `./wikidoc_publish.sh`  
> **확인 URL**: http://localhost:18090/wiki/ (wiki 프로파일 기동 필요)

---

## 자동 vs 수동

| 구분 | 대상 | 방법 |
|---|---|---|
| ✅ 자동 | `ai-docs/TEST/issues.md`, `ai-docs/TEST/progress.md` | `./wikidoc_publish.sh` 실행 시 `wiki/wiki-docs/private/test/` 로 자동 복사 |
| ✋ 수동 | 아래 wiki 파일들 | 직접 편집 후 `./wikidoc_publish.sh` 실행 |

---

## 변경 영역 → 업데이트 대상 매핑

작업 내용에 해당하는 행을 확인해 수동 파일을 업데이트한다.

| 작업 영역 | 수동 업데이트 파일 | 주요 업데이트 내용 |
|---|---|---|
| 프론트엔드 스택·라이브러리 변경 | `wiki/wiki-docs/services/frontend.md` | 기술 스택 테이블 |
| 프론트엔드 CSS 아키텍처 변경 | `wiki/wiki-docs/services/frontend.md` | 플랫폼 분기 CSS 섹션 |
| NativeInterface 변경·확인 | `wiki/wiki-docs/services/frontend.md` | NativeInterface 섹션 |
| 신규 공통 컴포넌트·시스템 추가 | `wiki/wiki-docs/services/frontend.md` | 해당 섹션 추가 또는 갱신 |
| BFF 엔드포인트 추가·변경 | `wiki/wiki-docs/services/bff.md` | 엔드포인트 테이블 |
| Engine API·환경변수 변경 | `wiki/wiki-docs/services/engine.md` | API 테이블, 환경변수 테이블 |
| 컨테이너·네트워크·보안 구조 변경 | `wiki/wiki-docs/private/architecture.md` | 컨테이너 구성, 보안 레이어 |
| DB 스키마 변경 (테이블·컬럼) | `wiki/wiki-docs/private/database.md` | 스키마 정의 |
| 서비스 맵·포트·Nginx 라우팅 변경 | `wiki/wiki-docs/services/overview.md` | 아키텍처 다이어그램, 라우팅 테이블 |
| 프로젝트 전반 개요·접속 URL 변경 | `wiki/wiki-docs/intro.md` | 개요 테이블, 빠른 시작 |
| QA 진척도·이슈 변경 | `ai-docs/TEST/progress.md`, `ai-docs/TEST/issues.md` | (자동 동기화 — 발행만 하면 됨) |

---

## 절차

```
1. 작업 완료
2. 위 매핑 테이블에서 영향받는 wiki 파일 확인
3. 해당 wiki 파일 직접 편집
4. ./wikidoc_publish.sh 실행
5. http://localhost:18090/wiki/ 에서 확인
```

---

## 각 wiki 파일별 편집 지침

### `services/frontend.md`
- **기술 스택 테이블**: 라이브러리 추가·제거 시 반영
- **플랫폼 분기 CSS 섹션**: `--status-bar-height`, `data-platform` 규칙 변경 시
- **NativeInterface**: 커맨드 키 추가, iOS/Android 확인된 동작 패턴 변경 시
- **Toast/알림 시스템**: 알림 방식 변경 시
- `VITE_USE_MOCK` 기본값: 현재 `false` (실 API 사용)

### `services/bff.md`
- 엔드포인트 추가 시 해당 그룹 테이블에 행 추가
- Path, Method, 한 줄 설명 형식 유지
- 전체 명세는 Swagger UI(`/api/bff/docs`) 참조 안내 유지

### `services/engine.md`
- Engine API는 BFF 내부 전용 — 외부 접근 불가 안내 유지
- 환경변수 추가 시 테이블에 행 추가

### `private/architecture.md`
- 컨테이너 추가·삭제 시 컨테이너 구성 테이블 갱신
- 보안 레이어(Nginx 경로 규칙) 변경 시 반영

### `private/database.md`
- 마이그레이션 파일(`database/init/`) 추가 시 갱신
- 테이블 추가·컬럼 변경 반영

### `services/overview.md`
- 포트·서비스 구성 변경 시 아키텍처 다이어그램과 포트 테이블 갱신

### `intro.md`
- 접속 URL 변경, 프로파일 구성 변경 시 빠른 시작 섹션 갱신
- Private 섹션 안내는 실제 파일 경로와 동기화 유지

---

## 참고: wikidoc_publish.sh 옵션

```bash
./wikidoc_publish.sh              # 동기화 + 재빌드 + 재기동 (기본)
./wikidoc_publish.sh --sync-only  # 파일 복사만 (docker 명령 생략)
./wikidoc_publish.sh --no-build   # 동기화 + 재기동만 (이미지 재빌드 생략)
```
