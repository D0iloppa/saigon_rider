# W5 — 매물 신뢰성 시스템(진위·적정가) 조사 (2026-08-17, HEAD 728031b)

## 0. 요약
- **진위 검증**: 서버 측 자동 차단은 없음. 있는 건 (1) 휴대폰 인증 게이트(개인), 업체 승인(법인), (2) 업체당 매물 5건 상한, (3) 어드민 검수 큐의 **기계판정 플래그 4종**(사진 2장 미만/가격 0원/카테고리 없음/근접중복) — **차단이 아니라 표시만**, 사람이 봐야 한다. 이미지 pHash·EXIF·스톡사진 탐지·금칙어(매물 본문)는 **코드에 없음**.
- **적정가 검증**: 카테고리별 가격 밴드, 시세 테이블, 외부 시세 연동 **전부 없음**. `price_vnd`는 0 이상만 강제(상한 없음) — VND 자릿수 오입력을 막는 장치가 전혀 없다.
- **콜드스타트에서 지금 당장 되는 것**: 규칙 기반 가격 밴드(수동 설정), 어드민 플래그 확장(사진수/가격0/근접중복은 이미 있음, pHash·자릿수 이상치 추가 가능). **자체 실거래 데이터 기반 시세는 지금 안 된다** — `agreed_price_vnd`(합의가 스냅샷) 컬럼은 있지만 실측 결과 213건 중 **1건만 채워져 있음**(A-3).
- DB 실측: 매물 213건 중 **188건(88%)이 단일 시스템 계정 "SaigonRider"** 소유 — 실사용자 공급은 사실상 0에 가깝다는 기존 감사 결론과 일치.

## A. 현행 코드 감사

### A-1 매물 진위 검증

| # | 검증 항목 | 판정 | 코드 근거 |
|---|---|---|---|
| 1 | 판매자 명의 위조 방지 | 있음 | `backend/app/routers/market.py:591` `body.seller_id != _session_uid` → 403 |
| 2 | 판매자 휴대폰 인증 게이트(개인) | 있음 | `market.py:633-634` `if business_profile is None and seller.phone_verified_at is None: raise 403` |
| 3 | 업체 명의 등록 시 승인 상태 확인 | 있음 | `market.py:601-609` `business_profile.status != "APPROVED"` → 403 (단, 서류검증(verification_status=verified)까지는 요구 안 함 — 주석에 "대표 결정 2026-08-11" 명시) |
| 4 | 업체당 매물 상한(어뷰징 방지) | 있음 | `market.py:610-629` 활성 매물 5건 초과 시 422 (`_BUSINESS_LISTING_CAP = 5`) |
| 5 | 필수 입력값 검증(제목) | 있음(최소) | `market.py:635-636` 빈 제목만 차단 |
| 6 | 서비스 지역 검증(좌표) | 있음 | `market.py:637-638` `in_service_area()` |
| 7 | **매물 본문 금칙어 필터** | **없음** | `banned_keywords` 테이블 존재(`database/init/131_banned_keywords.sql`)하고 주석엔 "매물/게시글 등록 시 필터링"이라 적혀 있으나, 실제 사용처는 `backend/app/routers/dm.py:68-77,398-399` (DM 메시지)뿐. `create_listing`/`update_listing`(`market.py`)에는 `_banned_keywords()` 호출이 전혀 없음 — **매물 제목·설명에는 금칙어 필터가 걸리지 않는다.** |
| 8 | 이미지 검증(중복/스톡/EXIF/워터마크) | **없음** | `backend/app/routers/contents.py:75-134` 업로드 엔드포인트는 MIME 화이트리스트(`ALLOWED_MIME_TYPES`)·매직넘버 스니핑(`_sniff_mime`)·15MB 상한만 있음. pHash/imagehash 등 라이브러리는 `backend/requirements.txt`에 없음(Pillow조차 없음). perceptual hash·스톡이미지 탐지·EXIF 검사·워터마크 검사 전무. |
| 9 | 어드민 검수 큐 기계판정 자동플래그 (커밋 d3d5760, 2026-08-11) | **있음(플래그만, 자동차단 아님)** | `backend/app/routers/admin_api/listings.py:82-92` `_flags_for()`: `LOW_PHOTOS`(사진<2장), `ZERO_PRICE`(가격=0), `NO_CATEGORY`, `DUPLICATE`(같은 `business_profile_id` + 제목 완전일치 + 첫 사진 `content_id` 완전일치 — `_duplicate_ids()` L95-117, 퍼지매칭 없음, 문자열/UUID 완전일치). 코드 주석(L77-81)에 "6기준 중 기계판정 가능한 것"이라 명시 — 나머지("실물 사진인가", "거래 장소가 실제 가게인가")는 사람 판단으로 남김. **이 플래그는 어드민 UI에만 노출되고, 매물 자체의 노출/판매 가능 여부에는 영향 없음.** 상태 전이(HIDE/REMOVE)는 `moderate_listing`(L252) 어드민 수동 조치로만 발생. |
| 10 | 중복 매물 탐지(범위) | 부분적 | 위 DUPLICATE 플래그는 **같은 업체 프로필 내부**만 비교(`_duplicate_ids` L99-100 `business_profile_id in_(...)`). 개인 판매자 간 중복(같은 사람이 개인 계정 여러 개로, 또는 다른 사람이 남의 사진을 도용해 올리는 경우)은 전혀 탐지 안 됨. |
| 11 | 신고 기반 사후 조치 | 있음 | `market.py:893-934` `report_listing` + admin `moderate_listing`/`bulk_moderate_listings` |

### A-2 적정가 검증

| # | 항목 | 판정 | 코드 근거 |
|---|---|---|---|
| 1 | 가격 하한 | 있음(0원만) | `backend/app/schemas.py:198-212` `price_vnd: int = Field(0, ge=0)`, DB CHECK `ck_mp_listings_price_nonneg`(`database/init/084_marketplace.sql:37`, `140_marketplace_trade_integrity.sql:19`) — **0원 허용은 "나눔"(무료나눔) 의도**(주석 `090`/`084` 참조), 버그 아님. |
| 2 | 가격 상한 | **없음** | 등록(`create_listing` L653)·수정(`update_listing_price` L823-853) 어디에도 상한 체크 없음. VND는 자릿수가 커서(₩1,000 ≈ 20 VND) 자릿수 오입력(1,000,000 vs 1,000,000,000) 시 걸러낼 장치가 전혀 없다. |
| 3 | 카테고리별 가격 밴드 | **없음** | `marketplace_categories`(`database/init/084_marketplace.sql`, `092_marketplace_category_tree.sql`) 테이블에 가격 관련 컬럼 자체가 없음(코드·상하한 등 없음). |
| 4 | 시세 데이터를 담는 테이블 | **없음** | `database/init/*.sql` 전체에서 "시세"/"price_index"/"market_price" 류 테이블 부재 확인. |
| 5 | 가격내림 배지(자체 이력) | 있음 | `market.py:823-853` `original_price_vnd` — 인하 직전가를 스냅샷, 원가 이상 재상향 시 NULL 리셋(`database/init/090_marketplace_price_drop.sql`). **단, "인상 전 가격을 부풀려 놓고 내린 척"하는 가짜 인하를 막는 검증은 없음** — 등록 시 `original_price_vnd`를 임의로 세팅하는 경로는 없어 위조는 어렵지만, 가격변경 API를 반복 호출해 인위적으로 높였다 낮추는 것 자체를 막는 로직은 없다(추정 리스크, 미검증). |
| 6 | 가격 제안(오퍼) | 있음 | `MarketplacePriceOffer`(`backend/app/models.py:1260-1276`, `database/init/110_marketplace_price_offers.sql`) — DM 대화별 PROPOSED/ACCEPTED/DECLINED/CANCELLED, `amount >= 0` CHECK만(상한 없음). |
| 7 | **거래완료가(실거래가) 기록** | **있음(메커니즘은 존재, 실사용은 거의 없음)** | `MarketplaceListing.agreed_price_vnd`(`backend/app/models.py` 주석 "MKT-7: 거래 완료 시점 스냅샷") — `complete_appointment`(`market.py:1391-1427`)와 어드민 `force_complete`(`backend/app/routers/admin_api/trades.py:160-214`)에서 해당 대화의 ACCEPTED 가격제안 금액을 우선 채택, 없으면 `price_vnd`로 폴백해 SOLD 시점에 기록. `get_trades`(`market.py:1735-1799`)가 거래내역 표시에 이 값을 사용. **이 컬럼이 향후 "자체 실거래가 기반 시세"의 유일한 씨앗**이지만, A-3 실측상 채움 비율이 극히 낮음(213건 중 1건). |
| 8 | 매물당 활성 약속(예약) 1건 제한 | 있음(무결성, 가격과 무관) | `database/init/140_marketplace_trade_integrity.sql:38-40` 부분 유니크 인덱스 |

### A-3 재료 실측
(`docker exec saigon_db psql`, SELECT만 — INSERT/UPDATE/DELETE 없음. 2026-08-17 시점 스냅샷)

- **매물 총 213건**: `ON_SALE 173 / SOLD 21 / RESERVED 17 / WITHDRAWN 2`
- **판매자 계정 다양성**: 매물 213건에 대해 **distinct seller_id는 15명뿐**이고, 그중 닉네임 `SaigonRider`(시스템/시연 계정으로 추정) 1개가 **188건(전체의 88%)**을 차지. 나머지 25건이 14명의 개인 계정(대부분 1~4건)에 분산. → 실사용자 공급이 사실상 0에 가깝다는 기존 감사 전제와 부합, 213건 대부분은 시연/시드 데이터로 판단(추정 — 계정 생성 경위는 미검증).
- **매물 생성 기간**: 2026-06-16 ~ 2026-08-17 (약 2개월).
- **`agreed_price_vnd` 채움 비율**: SOLD 21건 중 **1건만** 값이 채워짐 — 대부분의 SOLD 전환이 `complete_appointment`/`force_complete` 정식 플로우를 거치지 않았거나(예: 어드민이 상태만 직접 변경, 혹은 seed 데이터에서 status만 SOLD로 심음) 실거래 기록 파이프라인이 실제로는 거의 가동되지 않았음을 시사(추정, 원인 미검증).
- **카테고리 분포**(`marketplace_categories`, 74개 코드 중 상위): NULL(카테고리 미지정) 11건, `PARTS` 8건, `APP_FRIDGE` 7건, `DIGITAL_GAME`/`MF_BAG` 6건 등 — **롱테일**. 오토바이 버티컬(`BIKE` 2건, `MOTO_HELMET` 3건)은 소량.
- **`used_moto` 관련 정정 필요**: 작업지시서에 "최근 신설한 `used_moto` 카테고리"라 되어 있으나, 확인 결과 `used_moto`는 **매물(marketplace_listings) 카테고리가 아니라 `business_category`(업체 디렉토리/필드에이전트용) 테이블의 코드**(`database/init/178_business_category_used_moto.sql`, "중고 오토바이 판매점" — 필드에이전트 396곳 명단용, 2026-08-10 D-17). 매물 카테고리 트리 쪽의 오토바이 관련 코드는 `BIKE`(`092_marketplace_category_tree.sql:26,49` "중고 오토바이", `MOTORCYCLE` 대분류 하위)이며 이건 084(최초)부터 존재해온 것이지 "최근 신설"이 아니다. 가격 밴드 설계 시 이 두 테이블을 혼동하지 않아야 함.

## B. 외부 레퍼런스

### B-1 Chợ Tốt — 매물 검수·가격 규정
- **검수 절차**: 관리자가 등록 후 **24시간 내** 내용 검수, 규정 위반 시 이메일로 수정 요청, 재수정 후에만 노출. ([Chợ Tốt kiểm duyệt tin rao của tôi như thế nào?](https://trogiup.chotot.com/toi-la-nguoi-ban/cho-tot-kiem-duyet-tin-rao-cua-toi-nhu-the-nao/))
- **반려 사유(문서에 명시된 것)**: (1) 동일 계정 내 동일 상품 중복 등록 반려("Nếu bạn đã đăng 1 mặt hàng... toàn bộ những tin đăng bán cùng mặt hàng đó của bạn sẽ bị từ chối do trùng lặp") — 서로 다른 계정으로 동일 상품 등록도 반려 대상. (2) **인터넷에서 다운받은 이미지 반려**("Tin đăng sử dụng hình tải từ trên mạng sẽ bị từ chối") — 자체 촬영 원칙. (3) 사진 5~6장 미만/저품질/기울어짐/합성 이미지 반려, **다른 Chợ Tốt 매물의 워터마크가 남은 이미지도 반려 대상**(교차 도용 탐지 시사). (4) 사진/제목에 전화번호·URL·이메일·로고 포함 금지. (5) 설명 불충분(원산지·브랜드·모델·상태·보증 누락). ([Tại sao tin của tôi bị từ chối?](https://trogiup.chotot.com/nguoi-ban/tai-sao-tin-cua-toi-bi-tu-choi/))
- **가격 규정**: **VND 표기만 허용**(외화 표기 금지), 가격은 축약 없이 전액 표기(예: "100.000.000"). "Chợ Tốt kiểm soát một số giá bán sản phẩm"(일부 품목 가격 통제) — 단, 구체적 밴드 수치·알고리즘은 공개 문서에서 확인 못 함. ([Quy định đăng tin trên Chợ Tốt](https://trogiup.chotot.com/nguoi-ban/dang-tin/))
- **금지 품목**: 정치 민감물, 성인물, 위조품, 멸종위기종 제품, 의약품·건강기능식품, 중고 화장품, 대출/에스코트/인신매매성 구인 등. (동일 출처)
- **Chợ Tốt Xe(중고 오토바이/자동차 전문관)**: 월 1,600만 방문, 오토바이 매물 4만 건 규모의 별도 서비스로, 가격대별(500만 이하/500-1000만/1500-2000만 VND 등) 브라우징 카테고리를 운영 — "가격 가이드"라기보다 **필터링된 매물 목록**에 가깝다. 정형화된 "적정가 산출" 문서는 발견 못 함. ([Chợ Tốt Xe](https://xe.chotot.com/), [Mua ban xe may TPHCM](https://xe.chotot.com/mua-ban-xe-may-tp-ho-chi-minh))
- **ToS 스크래핑 조항**: `trogiup.chotot.com/nguoi-ban/hoat-dong/`(이용규정) 원문에서 "자동 수집/크롤링 금지"를 명시한 조항은 **찾지 못함**. 다만 "Người Bán cam kết không được thay đổi, chỉnh sửa, sao chép, truyền bá, phân phối, cung cấp và tạo những công cụ tương tự của dịch vụ do Chợ Tốt cung cấp"(Chợ Tốt 서비스와 유사한 도구를 복제·배포 금지)라는 조항은 있음 — 개별 매물 스크래핑보다는 "플랫폼 자체 복제" 금지에 가까운 문구로 판단(추정).

### B-2 당근마켓 — 시세 기능 / 안전거래
- **"AI 기반 내 물건 가격 찾기"**(2025-07-21 도입): 사진을 찍으면 AI가 물건을 인식해 예상 판매가를 제시. **원문에 명시된 근거는 "당근에서 이미 거래 완료된 동일/유사 물품의 판매 가격"** — 즉 **자사 축적 실거래 데이터** 기반이며, 원가 대비 감가율이나 외부 시세 크롤링이 아니다. ([당근, AI 기반 '내 물건 가격 찾기' 기능 도입](https://about.daangn.com/company/pr/archive/%EB%8B%B9%EA%B7%BC-ai-%EA%B8%B0%EB%B0%98-%EB%82%B4-%EB%AC%BC%EA%B1%B4-%EA%B0%80%EA%B2%A9-%EC%B0%BE%EA%B8%B0-%EA%B8%B0%EB%8A%A5-%EB%8F%84%EC%9E%85/)) → 이 방식은 **당근 스케일(수천만 유저 누적 실거래)에서만 성립**하며, 매물 0건에 가까운 지금 사이공라이더에 그대로 못 가져온다.
- **AI 사기 탐지 에이전트**(2025년 도입): 게시글·채팅 내용·동네 인증 여부·기기 정보를 종합 분석해 사기 위험도 산출 → 전문 모니터링 인력이 검토 후 제재. 번호를 한글로 우회 표기하는 등의 우회 시도도 탐지. ([당근, '중고거래 사기 막는다' AI 에이전트 도입](https://news.nate.com/view/20250908n16057))
- **안심결제(에스크로)**: 당근페이 가입 유저 간, 서비스 지역 한정으로 구매확정 시점에 대금 지급, 구매자 2% 수수료. 서울 일부 구 시범 후 전국 확대 계획. ([당근페이, 중고거래 '안심결제' 기능 도입](https://about.daangn.com/company/pr/archive/%EB%8B%B9%EA%B7%BC%ED%8E%98%EC%9D%B4-%EC%A4%91%EA%B3%A0%EA%B1%B0%EB%9E%98-%EC%95%88%EC%8B%AC%EA%B2%B0%EC%A0%9C-%EA%B8%B0%EB%8A%A5-%EB%8F%84%EC%9E%85/))
  - ※ 안심결제는 "적정가 검증"이 아니라 결제 신뢰 문제라 이번 조사 범위(A-1/A-2) 밖이지만, 신뢰 시스템 전반의 참고 사례로 기록.

### B-3 번개장터·중고나라 — 사기 매물 탐지
- **번개장터 자동 사기 탐지 시스템**: 빅데이터·머신러닝으로 채팅('번개톡') 내 사기 패턴 감지, 경고·즉시 차단. 2023년 사기 발생 90% 이상 급감, 전체 제재 조치 중 **43.3%는 유저 신고 이전에 AI가 선제 탐지**. 계좌 등 거래정보는 대화창에서 필터링. ([번개장터, 중고거래 불안 지운다](https://www.joongangenews.com/news/articleView.html?idxno=522627))
- **안전결제 일원화** + **안전거래지수(STI) 99.7%**(2025 하반기). ([번개장터, 모든 거래를 안전 거래로 100일](https://www.hankyung.com/article/202011237997P))
- 중고나라 관련 구체적 자동탐지 알고리즘 공개 자료는 검색 결과에서 **찾지 못함**(번개장터 위주로만 자료 확보).

### B-4 적정가 산출 일반 기법과 최소 데이터 요구량
- **룰 기반 밴드**: 데이터 요구량 0(사람이 카테고리별 상하한 설정) — 콜드스타트에서 유일하게 즉시 동작.
- **유사 매물 최근접(comparable listings)**: "recent auction results and online listings for machines similar in age/hours/spec" 비교 — 자사 DB 안에 비교군이 있어야 함, 매물 수십~수백 건 수준부터 의미. ([Tips for building a price estimation model for used cars](https://towardsdatascience.com/tip-and-tricks-for-building-a-price-estimation-model-for-used-cars-ac0953e194c4/))
- **감가곡선(신품가 대비)**: mileage/age가 주요 축, 다차원 감가모델도 있으나 이 역시 학습에 과거 거래가 필요. (동일 출처)
- **ML 회귀**: "AI excels at valuing mass-produced items with abundant historical data(수백만 건)... for unique/rare items where big data doesn't exist, scarcity of comparable data points makes it difficult" — **명확히 대량 데이터 전제**, 지금 사이공라이더 규모(매물 213건, 그나마 대부분 시드)에는 부적합. ([AI to Find Market Value for Used Goods](https://reelmind.ai/blog/ai-to-find-market-value-for-used-goods-smart-solutions))
- 공통적으로 "판매자가 써낸 호가는 신뢰할 수 없는 raw ground truth"라 이상치 제거가 전제조건으로 언급됨(동일 출처) — 사이공라이더는 애초에 `agreed_price_vnd`(실거래가) 자체가 거의 없어 이 단계 이전 상태.

### B-5 중고 오토바이 시세 — 베트남 공개 데이터 소스
- **베트남 재정부(Bộ Tài chính) "Bảng giá tính lệ phí trước bạ"(등록세 산정용 공시가격표)**: 오토바이 포함 차량의 **신차 기준가 × 잔존가치 비율(연식별)**로 중고 등록세를 산정하는 정부 공식 표. 최신본 `Quyết định 2226/QĐ-BTC`(2025-06-30). **정부 공개 데이터**이며 브랜드·모델·연식 단위로 조회 가능. 조회는 국세청 포털 `canhan.gdt.gov.vn`에서 **전자신원(định danh điện tử) 로그인 후** 가능 — 완전 익명 자동조회는 아니지만, 사람이 수동으로 참조하거나 향후 제휴/API 확인 시도가 가능한 **법적 리스크 없는 합법 공개 소스**. ([Hướng dẫn tra cứu giá tính lệ phí trước bạ](https://xaydungchinhsach.chinhphu.vn/huong-dan-cach-tra-cuu-gia-tinh-le-phi-truoc-ba-o-to-xe-may-119240321095023714.htm), [Quyết định 2353/QĐ-BTC](https://chinhphu.vn/?pageid=27160&docid=208945))
  - 이 표는 "중고차 가치 = 신차가 × 잔가율(%)" 방식이므로, **신차가만 알면 감가곡선 없이도 룰 기반 밴드의 뼈대로 즉시 전용 가능**하다는 점이 중요(단, 신차가 리스트를 별도로 확보해야 함, 미검증).
- **Chợ Tốt Xe**: 브랜드/모델/연식/가격대별 필터링 매물 목록은 있으나(월 4만 건 오토바이 매물), 정형화된 "시세 API/가이드" 페이지는 못 찾음.

### B-6 이미지 중복/스톡 탐지 실무 기법
- **perceptual hash(pHash/aHash/dHash/whash)**: "unlike cryptographic hashes, perceptual hashes are designed to produce similar hashes for visually similar images" — 압축·리사이즈 정도의 변형에는 강하지만, **"a scammer who trims eight pixels, flips the frame, or adds a watermark will generate a new binary hash"** — 크롭/반전/워터마크 추가에는 취약(한계 명시). ([Duplicate image detection with perceptual hashing in Python](https://benhoyt.com/writings/duplicate-image-detection/))
- **파이썬 생태계**: `imagehash`(JohannesBuchner/imagehash, PIL 기반) — average/perceptual/difference/wavelet hash 4종 + color hash 지원, 가장 널리 쓰이는 OSS 라이브러리. ([GitHub: JohannesBuchner/imagehash](https://github.com/JohannesBuchner/imagehash))
- **실무 팁**: Hamming distance 임계값으로 유사도 판정, 단독 사용보다는 NLP(설명 문구 재사용 탐지)·가격/화법 패턴 탐지와 결합하는 사례가 언급됨(일반론, 특정 벤더 자료). ([Doppel: Fake Product Seller Detection](https://www.doppel.com/blog/fake-product-seller-detection-marketplaces))

### B-7 베트남 법 — 외부 시세 크롤링의 법적 리스크
- **개인정보보호법(PDPL) + Nghị định 356**: 베트남 개인정보보호 관련 핵심 법령. 매물 데이터에는 통상 판매자 전화번호·닉네임 등 개인정보가 포함되므로 스크래핑 시 이 법의 적용을 받을 가능성. ([Data Protected Vietnam](https://www.linklaters.com/en/insights/data-protected/data-protected---vietnam))
- **형사 리스크**: "동의 없이 인터넷/통신망에 개인 또는 사업자의 정보를 유출해 2억 VND 이상의 부당이득을 얻으면 최대 7년 징역", "타인의 컴퓨터망·통신망·전자기기에 대한 불법 접근은 사안에 따라 최대 12년 징역" — 출처는 위와 동일 링크에 인용된 베트남 데이터보호 프레임워크 요약(2차 출처 인용이므로 원 법조문 대조 필요, **추정치로 취급**).
- **ToS 위반의 민사적 성격**: 스크래핑이 ToS를 명시적으로 금지하는 경우 계약 위반(breach of contract)에 해당할 수 있고, 이는 계정 정지·민사 청구로 이어질 수 있음(일반론, 관할 불문). Chợ Tốt 자체 ToS에서 "자동 수집 금지" 명문 조항은 B-1에서 못 찾았지만, 부재가 곧 허용을 의미하지 않음.
- **결론(리서치 한도 내)**: Chợ Tốt를 직접 크롤링하는 방식은 (1) ToS 명문 스크래핑 금지 조항은 못 찾았으나 서비스 복제 금지 조항과 저촉 소지, (2) 셀러 개인정보(전화번호 등)가 매물에 노출돼 있다면 PDPL 적용 가능성, (3) 최악의 경우 형사 리스크까지 거론되는 프레임워크 — **법무 검토 없이 진행할 사안이 아니다**로 정리한다(단정하지 않음, 감독의 법무 확인 필요 항목으로 D 에 명시).

## C. 설계 옵션

### C-1 매물 진위 검증 — 옵션 비교표

| 옵션 | 잡아내는 것 | 오탐 리스크 | 구현 비용(추정) | 콜드스타트 동작 | 처리 방식 |
|---|---|---|---|---|---|
| **① 매물 본문 금칙어 필터 확장** — 이미 있는 `banned_keywords`/`_banned_keywords()`(현재 DM 전용, `dm.py:68-77`)를 `market.py`의 `create_listing`/`update_listing`에도 적용 | 연락처 유출(전화번호 패턴), 명백한 불법 품목 키워드, 스팸 문구 | 낮음(정규식 오탐 가능하나 룰 직접 관리로 통제 가능) | 매우 낮음(파일 1개, 함수 하나 재사용 — `dm.py`의 `_banned_keywords`를 공용 모듈로 옮기거나 그대로 import) | **즉시 동작**(데이터 불필요) | 자동 차단(등록 자체를 400/422로 거부) 권장 — Chợ Tốt도 제목에 전화번호 있으면 반려(B-1) |
| **② pHash 기반 근접중복/스톡이미지 플래그** — `imagehash`(Pillow 필요, 현재 `requirements.txt`에 둘 다 없음) 도입, 업로드 시 해시 계산·저장, 기존 매물과 Hamming distance 비교 | 동일/거의 동일 이미지 재업로드, 사이트 간 이미지 도용(자체 DB 내에서만) | 중간(크롭/반전/워터마크에 취약 — B-6 명시) | 중간(신규 의존성 추가, DB에 hash 컬럼, 계산 파이프라인, 배치 or 업로드 훅) | **즉시 동작 가능**(매물 0건이어도 앞으로 쌓이는 이미지끼리 비교 가능 — 단 비교 대상이 적을수록 효용도 낮음) | 어드민 플래그만 권장(오탐 시 정상 재판매 매물까지 막힐 위험) |
| **③ 어드민 검수 큐 자동플래그 확장**(기존 `_flags_for()`, `admin_api/listings.py:82-92`에 룰 추가) — 예: 가격 자릿수 이상치(C-2와 연동), 계정 생성 직후 다건 등록, 같은 이미지 content_id가 서로 다른 업체/개인 간 재사용(현재는 같은 business_profile_id 내부만 봄, `_duplicate_ids` L99-100) | 다계정 어뷰징, 신규계정 대량등록, 타인 사진 도용 | 낮음(플래그만, 차단 없음 — 기존 패턴 그대로) | 낮음(기존 함수 확장, 신규 인프라 없음) | **즉시 동작** | 플래그(기존 패턴과 동일하게 유지) |
| **④ EXIF 메타데이터 검사** — 촬영 기기/시각 유무로 "인터넷에서 다운받은 사진" 추정(Chợ Tốt이 명시적으로 반려 사유로 쓰는 패턴, B-1) | 웹에서 긁어온 스톡컷(EXIF 제거된 경우 많음) | **높음** — 요즘 다운로드 이미지도 EXIF 보존된 경우가 흔하고, 반대로 정상 사용자가 메신저로 재압축해 올리면 EXIF가 사라져 오탐 가능 | 낮음(Pillow의 EXIF 리더 정도) | 즉시 동작 | 플래그 권장(신뢰도 낮은 신호이므로 단독 차단 부적절) |

**과설계 경계선**: ML 기반 이미지 분류(가품/스톡 판별 딥러닝 모델)는 이 단계에서 제안하지 않는다 — 매물 절대량이 적어 학습/검증 데이터가 없고, 위 ①~④로 커버 가능한 문제를 모델로 풀 이유가 없다("시니어 엔지니어가 과설계라 할 것" 자문 결과).

### C-2 적정가 검증 — 3경로(a/b/c) 평가표 + 독립 모듈 구조 옵션

| 경로 | 콜드스타트 동작 | 법적/ToS 리스크 | 정확도 잠재력 | 유지보수 비용 |
|---|---|---|---|---|
| **(a) 외부 시세 수집**(Chợ Tốt 등 크롤링/API) | **동작 안 함/리스크 큼** — B-1에서 Chợ Tốt 공식 API 존재 확인 못함(=스크래핑 전제), B-7에서 PDPL·형사 리스크·ToS 저촉 가능성 확인 — **법무 검토 없이 착수 불가**. 대안으로 베트남 재정부 공식 "등록세 공시가격표"(B-5)는 합법 공개 데이터이지만 전자신원 로그인 필요해 자동화 난이도 있고, 커버리지가 오토바이 한정(타 카테고리엔 없음) | **높음**(사설 플랫폼 크롤링) / **낮음**(정부 공시표, 단 자동조회 방법 미확인) | 커버리지 확보 시 가장 현실적인 시세 근사치 | 크롤러 유지보수(사이트 구조 변경 대응) + 법무 리스크 관리 — 지속적 부담 |
| **(b) 규칙 기반 밴드**(카테고리별 상·하한 수동 설정) | **즉시 동작** — 데이터 0건에서도 사람이 값만 채우면 바로 작동 | 없음(외부 데이터 미사용) | 낮음~중간(카테고리가 74개 세분류라 초기엔 대분류 17종 단위로만 밴드 설정하는 게 현실적 — B-5 재정부 표를 오토바이 카테고리에 한해 참고자료로 활용 가능) | 밴드 값을 누가·얼마나 자주 갱신하나가 관건 — 74개 세분류 전체를 유지하려면 운영 부담 큼, 대분류 위주로 시작 권장(추정) |
| **(c) 플래그만 생성**(자동차단 없이 어드민 검수 큐에 이상치 표시) | **즉시 동작** — (b)의 밴드나 단순 "카테고리 평균 대비 N배 이상/이하" 같은 상대 규칙만으로도 가능 | 없음 | 밴드 설계 품질에 종속 | 낮음(기존 `_flags_for()` 패턴에 필드 하나 추가하는 수준) |

**3경로 종합 판단**: (a)는 지금 시점에 채택 불가(법무 미확인 + 콜드스타트에 커버리지도 없음). **(b)+(c) 조합이 지금 유일하게 현실적** — 대표가 정할 몫이지만, "규칙 기반 밴드로 상하한을 잡고, 밴드를 벗어나면 자동차단이 아니라 검수 큐에 플래그"가 (b)/(c)를 합친 가장 보수적인 시작점이라는 점만 사실로 기록한다.

**독립 모듈 구조 옵션** (대표 지시: 매물 등록 플로우에 강결합 금지):

| 구조안 | 설명 | 기존 아키텍처 정합성 | 비고 |
|---|---|---|---|
| **① BFF 내 별도 모듈** `backend/app/modules/pricing/` (기존 `backend/app/modules/ads/`, 코드베이스에 `modules/proximity` 언급은 확인 못 했으나 `modules/ads`가 동일 선례) | `create_listing`이 이 모듈을 **동기 호출하지 않고**, 등록 후 비동기 이벤트(`noti_events.enqueue` 패턴을 이미 `market.py:675-684`에서 씀)로 "가격 평가 요청"을 흘려보내고, 별도 워커/배치가 평가해 어드민 플래그 테이블에 결과를 씀 | **가장 정합적** — 기존 `noti_worker` 패턴(발행-구독, DB 아웃박스)을 그대로 재사용 가능, 이미 있는 인프라(엔진 없이 BFF 자체 워커)로 충분 | 신규 컨테이너 불필요, "독립적"은 "별도 프로세스"가 아니라 "등록 트랜잭션과 결합 안 함(동기 호출 없음)"으로 해석 |
| **② 별도 컨테이너 서비스** | 완전히 분리된 FastAPI 서비스, BFF가 HTTP로 호출 | CLAUDE.md의 BFF↔Engine 분리 원칙과는 결이 다름(Engine은 RP/미션/보상 전용 도메인) — 가격평가는 그 도메인이 아니므로 Engine에 넣는 것도 부적절 | 지금 매물 규모(213건, 실제로는 훨씬 적음)에 컨테이너 하나를 새로 띄우는 건 **과설계 소지** — "시니어 엔지니어가 과설계라 할까?" 자문 시 이 옵션이 가장 걸림 |
| **③ Engine 쪽에 추가** | RP·미션·보상 엔진에 가격평가 도메인을 얹음 | **부적합** — Engine의 명시된 책임(RP/미션/보상)과 무관한 도메인을 섞는 것은 기존 BFF/Engine 분리 원칙 위반 소지 | 비권장 |
| **④ 배치 잡**(cron) | 등록과 완전 비동기 — 예: 매일 1회 신규/변경 매물을 스캔해 밴드 이탈만 플래그 | 등록 시점 즉시 피드백은 못 줌(신뢰성 개선 효과 지연) | (b)+(c) 조합이면 등록 즉시 판정 가능하므로 배치보다 ①(이벤트 기반) 쪽이 사용자 경험상 낫다(추정) |

**판단 근거 요약**: "독립적"이라는 대표 지시는 "매물 등록 API 응답 경로에 가격평가 로직이 동기적으로 끼어들지 않는다"로 해석하는 게 기존 코드 패턴(이미 `noti_events.enqueue`로 검색색인·알림을 비동기 이벤트화한 전례, `market.py:673-684` 주석 "FD-6: 매물 등록과 같은 트랜잭션에 이벤트를 적재해... 커밋~발행 사이 유실을 막는다")과 가장 잘 맞는다. 신규 컨테이너(②)는 지금 매물 볼륨에 비해 과한 인프라라는 점만 사실로 남기고, 최종 구조 선택은 감독 몫이다.

### C-3 감독이 결정해야 할 것 (D-번호로 정리)

- **D-1**: 매물 본문 금칙어 필터(C-1 옵션①)를 `market.py`에도 적용할지 — 지금 DM에만 걸려 있고 매물 등록엔 안 걸리는 게 의도된 설계인지, 아니면 누락인지 확인 필요.
- **D-2**: 가격 상한(price_vnd 절대 상한 또는 VND 자릿수 검증)을 지금 바로 넣을지 — 코드 변경 최소(스키마 `Field`에 `le=` 추가 수준)이므로 대표 판단만 있으면 바로 착수 가능한 항목.
- **D-3**: C-2의 (a)/(b)/(c) 중 채택 조합, 그리고 (b) 규칙 밴드를 74개 세분류 전부에 채울지 대분류(17종) 우선으로 시작할지.
- **D-4**: C-2 독립 모듈 구조안 4가지 중 선택(①이 기존 패턴과 가장 정합적이라는 사실만 보고, 결정은 대표 몫).
- **D-5**: pHash 이미지 중복탐지(C-1 옵션②) 도입 여부 및 시점 — 신규 의존성(`imagehash`+`Pillow`) 추가를 대표가 승인할지.
- **D-6**: 외부 시세 크롤링(C-2 경로 a)의 법무 검토를 진행할지 여부 — B-7에서 확인한 PDPL/형사 리스크 프레임워크가 실제로 이 프로젝트에 적용되는지는 변호사 확인이 필요한 영역이라, 이 보고서만으로 결론 낼 수 없음.
- **D-7**: 베트남 재정부 등록세 공시가격표(B-5)를 오토바이 카테고리 가격 밴드의 참고자료로 쓸지 — 전자신원 로그인이 필요해 자동 연동은 어렵고 수동 참조/주기적 갱신 수준이 될 가능성.

## D. 미검증으로 남긴 것

- 가격변경 API(`update_listing_price`, `market.py:823-853`)를 반복 호출해 `original_price_vnd`("가격내림" 배지)를 인위적으로 조작할 수 있는지 — 코드상 막는 로직은 못 찾았으나 실제 공격 시나리오까지 재현하지는 않음(읽기 전용 원칙, 코드 변경 금지 제약 하에서 정적 분석만 수행).
- 매물 213건 중 188건을 보유한 "SaigonRider" 계정의 실제 성격(시스템 계정/시연용/테스트) — DB에 계정 유형을 구분하는 필드가 있는지까지는 조사하지 않음, SELECT로 닉네임만 확인.
- SOLD 21건 중 `agreed_price_vnd`가 채워지지 않은 20건이 왜 정식 완료 플로우를 거치지 않았는지(seed 데이터 직접 삽입 vs 다른 경로) — 원인 미조사.
- Chợ Tốt·번개장터·당근마켓의 **정확한 가격 상하한 수치**나 밴드 알고리즘 세부(예: 카테고리별 몇 % 편차까지 허용하는지) — 공개 문서에서 구체적 수치는 찾지 못함, 일반론 수준만 확보.
- 베트남 PDPL/형사 조항 인용은 2차 출처(법무법인 요약)를 근거로 했고, 원 법조문(Nghị định 356 등) 원문 대조는 하지 않음 — 실제 법무 판단 시 원문 확인 필수.
- 중고나라의 자동탐지 알고리즘 관련 자료는 검색에서 확보하지 못함(번개장터 자료만 확보).
- 재정부 등록세 공시가격표(`canhan.gdt.gov.vn`)의 실제 조회 UX·자동화 가능 여부(전자신원 로그인 우회/제휴 가능성)는 실제 접속 시도 없이 문서 설명만으로 판단함.
