# 동네지도 당근 레퍼런스 UX 반영 — 포스트 패널 · 지도보기 필 · 카테고리 DB화 · 읽음 뱃지 (2026-07-11)

> **SoT**: 이 문서. 선행: [`260711_map_biz_icons_autobubble_news_task.md`](260711_map_biz_icons_autobubble_news_task.md) (코드·검증 완료).
> **Plane 등록 대기** (세션에 Plane MCP 부재). 레퍼런스: 당근 동네지도 스크린샷 4장 (`~/workspace/w_dev/saigon_rider/_tmp/image copy 39·41·42·43.png`).
> **운용 방식(대표 지시)**: 작업별로 분석 에이전트 → 구현 에이전트 분리 투입, 모델은 작업 성격에 맞게 라우팅.

## 대표 확정 결정 (2026-07-11 대화)

1. **포스트 사진 N장**: `business_news`에 사진 0~N장 (상한 룰 예: 10장). contents 테이블 중개 — 정션 테이블(`business_news_photo(news_id, content_id, sort_order)` 류) + `build_imgproxy_url` 출력.
2. **카테고리 DB화 + 확장**: 하드코딩 5종 → DB 테이블(`business_category`: code·그룹·아이콘 키·ko/en/vi 라벨·정렬). 아이콘 매핑 포함. 카테고리 확장(오토바이 생활권 기준 12~15종, 기존 5종 코드는 호환 유지).
3. **읽음 뱃지 저장 = localStorage** (기기 로컬, `{bizId: 마지막 읽은 post created_at}` 맵. 서버 영속화는 후속 승격 옵션).
4. **N명이 보는중 = 소켓 없이 Redis TTL + 폴링** (포커싱된 업체 1곳만 15s 폴링, sorted-set 30s 만료).

## 작업 항목

| # | 내용 | 분석 | 구현 | 상태 |
|---|---|---|---|---|
| W1 | [지도보기] 필 — 시트 full일 때 하단 중앙 노출, 탭 시 시트 collapsed | Sonnet | Sonnet | 완료 |
| W2 | 핀 터치 → 포스트 패널 (바텀시트 대체, 최신 post·사진·좌우 캐러셀·스와이프=핀 포커싱·[X]=시트 복귀) + N명 보는중 | Sonnet | Fable | 완료 |
| W3 | 카테고리 칩 [더보기] + 카테고리 전체 페이지(그룹 섹션 그리드) + 카테고리 DB화·확장 + 포스트 사진 N장 스키마 | Sonnet | Sonnet(백엔드·페이지) | 완료 |
| W4 | 핀 우상단 unread 빨간 점 (localStorage 읽음 추적, 포스트 패널 열람 시 읽음 처리) | Sonnet | Sonnet | 완료 |

**의존/순서**: W3(카테고리·사진 스키마)가 데이터 기반 → W2(포스트 패널)가 사진 사용 → W4가 W2의 읽음 이벤트 사용. W1은 독립. 구현 순서 W3 → W1 → W2 → W4.

**모델 라우팅 근거**: 분석(코드 지도·사용처 전수 조사)은 커버리지가 관건인 기계적 탐색 → Sonnet. W2 구현은 시트 대체 인터랙션·캐러셀↔지도 포커싱 동기화 품질 판단 필요 → Fable. W1/W3/W4 구현은 기존 패턴 미러링 → Sonnet.

## 인터랙션 명세 (레퍼런스 해석)

- **자동 포커싱(줌·센터)** → 기존 [새소식] 말풍선 유지 (선행 패키지).
- **핀 직접 터치** → 말풍선 대신 **포스트 패널**: 바텀시트 숨김·대체. 카드 = 업체 프로필(사진·상호·업종)+상대시간+본문(라인 클램프)+사진. 카드 상단 지도 여백에 [X](우측)와 "N명이 보는중" 칩(중앙).
- 패널은 가로 스와이프 캐러셀 — 항목 = 현재 뷰포트 내 최신 post 보유 업체들(가까운 순). 스냅 시 해당 업체 핀으로 지도 포커싱+하이라이트.
- [X] → 패널 닫기 + 바텀시트 복귀. 탭 전환·검색 진입 시에도 패널 해제.
- **unread 뱃지**: `latest_news.created_at > localStorage 읽은 시각` 이면 핀 우상단 빨간 점. 포스트 패널에서 해당 업체 카드가 포커싱되면 읽음 기록.

## 진행 기록

- 2026-07-11: 패키지 발행, 분석 에이전트 3기(Sonnet) 투입.
- 2026-07-11: **W1~W4 전건 구현·검증 완료, 커밋됨.** W3-BE `4ae528a`(business_category init/119, 15종·4그룹·아이콘 키·3개국어 — BizApply taxonomy 이원화 선재버그 해소, FK+레거시 정규화 / business_news_photo init/120, 상한 10은 등록 API 후속) + `7689406`(view-ping, Redis ZADD 멱등·30s 윈도우) / W3-FE `037aea3`(칩 15종 API 렌더·더보기·`/map/categories` 그룹 그리드·파트너 화면 통일) / W1 `0801724`(DraggableSheet floatingTopCenter) / W2 `d9f0dac`(PostPanel — 핀 터치 시 시트 대체 캐러셀·IntersectionObserver 스냅→focusPointRef 줌 유지 recenter+선택 링·15s 폴링 "N명이 보는중") / W4 `8b2091a`(localStorage `sgr.biz.readNews`, 뉴스 createdAt 저장 — skew 안전). **검증**: 통합 시각 회귀 8시나리오 전건 PASS(하네스 `tools/qm/regr-map.mjs`, 커밋 `7df2082`). **qm-reviewer(Opus) 독립 리뷰 CHANGES → 수정 반영**(`7df2082`): placeForm.error 키 신설(오문구 교정)·`useVisualViewport.ts` 고아 삭제·`handleCarouselIndex` useCallback. **잔여(제품 결정 대기, P3)**: 패널 닫힘 직후 자동 말풍선 재점화 UX 뉘앙스 / view-ping 자기 포함 카운트 여부. **후속**: 소식 사진 등록 API 구현 시 상한 10 적용. 운영 배포 시 init/119·120 적용+BFF 재시작+프론트 재빌드.
