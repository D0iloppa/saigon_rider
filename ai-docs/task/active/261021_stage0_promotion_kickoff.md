# Stage 0 착수 — 베트남 홍보 "노출 엔진이 홍보" (2026-10-21)

- 상태: **IN_PROGRESS — Stage 0 (10/21~11/03)**. 대표 승인 2026-10-21: Q1 외부 지출 총액 6,000만 VND 상한 · Q2 쇼츠 주 2편 · Q3 권도일 2~3주 공개 웹 레이어 우선 배정 — **세 가지 모두 제안대로 승인**.
- 근거 문서: 분석 원문 [`research/261021_vietnam_launch_promotion_analysis.md`](../../research/261021_vietnam_launch_promotion_analysis.md) · PDF `research/261021_vietnam_launch_promotion/saigon_rider_vietnam_promotion_staged_plan_2026-10-21.pdf` · 설계 [`spec/261021_public_web_layer_design.md`](../../spec/261021_public_web_layer_design.md)
- 작성: Claude(대표 세션, factmind PC). 이 레포의 다른 실험·규칙과 충돌하는 지점은 §2 에 적었다. **이 문서는 Plane 을 대체하지 않는다** — 티켓은 권도일이 등록한다.

---

## 0. 결정 요약 (D1~D8 = Claude 조사 결정 · Q1~Q3 = 대표 승인)

| # | 결정 | 상태 |
|---|---|---|
| D1 | 핵심 가치 = 노출 엔진이 홍보. 공개 웹 레이어(fm 레이어 P6 확장)를 최우선 개발 | 승인 |
| D2 | 침수 공개 범위 = 사용자 제보(사실) + 공식 경보(출처 표기) + 과거 상습 구간. **자체 예측(`flood_risk_daily`)은 공개 페이지·위젯에 싣지 않음** — 기상수문법(예보·경보 활동 허가제, 시행령 155/2024) | 승인 |
| D3 | 유료 광고 = 측정 실험 280만 VND 1회(Stage 1), 이후 월 상한 500만. 트래픽 목적, 앱설치 목적 아님 | 승인 |
| D4 | 분석 = `@capacitor-firebase/analytics` + Play Install Referrer 플러그인. Meta SDK·AppsFlyer 제외 | 승인 |
| D5 | 업체 시딩 재착수("내 가게 Google 에 올리기" 가치 제안). 8월 계획 19,147,500 VND 그대로 | 승인 |
| D6 | 법무 1회(히엔 + 현지 법무). 계약 주체 GOODIS | 승인 |
| D7 | FactMind 부품: **이미 `factmind-saigon/` 로 이식돼 운영 중(P0~P5 완료, `8569bb6d`)** → 새로 복사하지 않고 P6 확장으로 간다 | 승인(수정) |
| D8 | 쇼츠 베트남어 보이스 = 히엔. 서치콘솔 소유 확인은 DNS TXT 로 이미 완료 | 승인 |
| Q1 | 외부 지출 총액 약 6,000만 VND(시딩 알바 1,915만 + Stage 1 1,350만 + Stage 2 2,350만 + 법무 300만~500만). 초과 시 재보고 | **대표 승인** |
| Q2 | 대표 쇼츠 주 2편(11월~1월) | **대표 승인** |
| Q3 | 권도일 2~3주 공개 웹 레이어 우선(라운지·결제는 Stage 1 중반 이후) | **대표 승인** |

---

## 1. 10/21 Claude 가 직접 확인·처리한 것

| 항목 | 결과 |
|---|---|
| 저장소 최신화 | 이 PC 복제본이 origin/main 보다 368 커밋 뒤였음 → `fe8d8e88` 로 ff 갱신. 남의 미커밋 `ai-docs/index.md` 1줄은 stash 보관 후 복원 |
| fm 레이어 실태 | `/b/<slug>/`·`/l/`·`/l/<ward>/<category>/`(vi·ko·en)·`sitemap-fm.xml`·`rss.xml`·IndexNow 키가 BFF 에서 서빙 중. 운영 발행 = 플랫폼 프로필 1건(`saigon-rider-official`), 업체 0 → `/l/hcmc-sai-gon/` 884자(Soft 404 모양) |
| 블로그 실험 | `261010_fm_google_blog_exposure_task.md` — 12편(vi 6·ko 6) 10/13 일괄 발행, 8주(≈12/08) 교란 통제: **블로그 URL 외부 홍보 금지 · 랜딩 홈 콘텐츠 변경 금지** |
| 서치콘솔 | DNS TXT `google-site-verification` 존재(소유 확인 완료). 사이트맵 제출·색인 상태는 콘솔 로그인 필요(권도일) |
| 서버 공개 층 출처 | `/var/www/saigon-rider/`(index·blog·sitemap-site·robots) 는 서버 계정 `textmind` 가 10/19 15:37 배포(랜딩 빌드 산출물). `/b/ /l/` 은 BFF. — 0-8 해소 |
| TextMind 정체 | 같은 서버 `/opt/textmind-serial/` — 대표의 무인 연재 에이전트(네이버 연재 1일 1편 · 취향판본 오리지널 1일 1편, systemd timer, Claude 무인 세션 + 엔진). 로컬 정본 `C:\text_mind`. 사이공 전용 잡은 아직 없음 |
| Play 리스팅 | 라이브, 다운로드 "10+", 설명 "ứng dụng mua bán đồ cũ và cộng đồng dành cho biker" |
| `app_down.html` | **갱신·배포**: Android → Google Play 즉시 이동(referrer=utm 귀속), iOS → "심사 중" 안내, 데스크톱 → Play 배지. `?src=qr-biz-<코드>` 로 업체 QR 귀속 |
| `robots.txt` | AI 봇 허용(OAI-SearchBot·ChatGPT-User·GPTBot·ClaudeBot·Claude-User·Claude-SearchBot·PerplexityBot·Perplexity-User·Google-Extended·Applebot·CCBot) 추가·배포 |
| 랜딩 홈 배지·문구 | **보류** — 블로그 실험 C arm(랜딩 홈 변경 금지, 12/08 까지). 실험 종료 또는 4주차 판독(11/10) 후 대표 결정으로 적용. 적용 문구는 §5 에 준비 |
| 업체 시딩 | 저장소 기준 8/11 이후 실행 흔적 없음(커밋·문서 0). 재착수 자료 §6 |
| UrBox·Zalo 승인 | 레포에 7/16 이후 기록 없음 · `.env` 는 이 PC 에 없음 → 권도일·히엔 확인(§3) |

---

## 2. 기존 실험·규칙과의 조정 (충돌 지점 — 숨기지 않는다)

1. **블로그 실험 8주 통제(10/13~12/08)**: 블로그 URL 은 소셜·Zalo·앱 내 어디에도 올리지 않는다. Stage 1 의 그룹 유통은 **침수 도로 페이지(신규 URL, 실험 밖)** 와 `app_down.html` 만 쓴다. 랜딩 홈(`/`·`/ko`·`/en`)과 `/l/` 은 콘텐츠·구조를 바꾸지 않는다. 신규 페이지에서 홈으로 가는 링크는 허용, 홈에서 신규 페이지로 가는 링크 추가는 실험 종료 후.
2. **4주차 판독 11/10**(K1 크롤·K2 색인) 결과로 대표가 ① 실험 유지(12/08) ② 조기 종료 후 랜딩 개편을 결정한다. 조기 종료 시 §5 문구·배지를 즉시 적용.
3. **"AI 로 본문 양산 금지"(실험 §2.3-4)** 와 TextMind 활용의 조정: TextMind 사이공 잡은 **주 2편·출처 필수·히엔 검수 통과분만 게시** 로 설계한다(일 1편 무인 게시는 Google scaled-content 정책 위험 + 실험 규칙 위반). 초안 생산은 지금부터 큐에 쌓고, 게시 시작은 11/10 판독 뒤 대표 결정. 설계는 `spec/261021_public_web_layer_design.md` §7.
4. **fm P6 게이트("4주 VERIFIED 봇 방문 > 0 + 대표 결정")**: 대표 결정은 10/21 Q3 로 내려졌다. 봇 방문 실측은 `/admin/fm` 에서 권도일이 읽어 Stage 0 종료 보고에 넣는다.
5. **SRE 경제·km 보상**: 기사 전용 보상은 경제 캡 재설계 전까지 금지(Stage 3).

---

## 3. 사람별 작업 지시 (Stage 0, ~11/03)

### 권도일
| # | 할 일 | 산출물·검증 |
|---|---|---|
| 0-3 | 설치 귀속: `@capgo/capacitor-install-referrer`(또는 capawesome install-referrer) 로 Play referrer 수신 → `POST /tracking/first-touch` 에 utm 전달(기존 `lib/acquisition.ts` `captureUtmFirstTouchFromUrl` 과 같은 경로, 앱 첫 실행 1회). `@capacitor-firebase/analytics` 추가(Firebase 프로젝트 생성은 권도일 Google 계정, `google-services.json` 은 커밋 금지). 개인정보처리방침 vi/ko/en 에 분석 SDK 항목 추가 | `app_down.html?src=test` → 설치 → 가입 → `users.acquisition_source`/first-touch 에 `utm_source=test` 기록 |
| 0-4 | 서치콘솔: `saigon-rider.com` Domain 속성에서 `sitemap.xml` 제출 여부·색인 수 확인 → `/admin/fm` 콘솔 수기 입력. `/admin/fm` 봇 방문 7/14/30일 수치 기록 | Stage 0 종료 보고 표 1개 |
| 0-4b | 공개 웹 레이어 설계서 검토·티켓화(`spec/261021_public_web_layer_design.md`). 1차 범위 = 침수 도로 페이지 + 업체 fm 발행 자동화(APPROVED+verified → FmSubject publish 잡) + 밀도 게이트 | Plane 티켓 3개 |
| 0-5 | Meta 광고계정 비즈 인증(7월 계획 그대로) — 집행은 Stage 1 | 광고계정 승인 |
| 0-6 | 업체 시딩 선행 개발 점검: `scripts/import_business_csv.py`·`seed_member_listings` 현황, 업체 사장 매물 등록 권한(8/11 보고의 "2~3일 선행 개발") 완료 여부 | 가능/불가 1줄 |
| 확인 | Zalo 로그인 앱 승인 상태(`.env` `ZALO_APP_ID`), `TRANSLATE_API_KEY` 403 해소 여부, UrBox NDA 진행 | 3줄 보고 |
| 0-2 | Play Console 리스팅 문구 교체(§5 문안) · 스크린샷 1·2 = 침수 지도 | 콘솔 반영 |

### 히엔 선생님
| # | 할 일 | 산출물 |
|---|---|---|
| 0-5 | Facebook 페이지 · Zalo OA(성장 패키지 250만 VND/년) · TikTok 계정 개설. 명의 = GOODIS/Saigon Rider, 연락처 = 히엔 | 계정 3개 + 접속 정보(비밀값은 `.secrets` 로) |
| 0-7 | 법무 1회 상담 — 질문지 §7 그대로 들고 간다. 결과를 분류표 1장으로 | 분류표 |
| 0-6 | 업체 시딩 안내지(§6) 베트남어 검수·인쇄 300장. 현장 알바 모집(8월 단가표: 10건/30만 동) | 안내지 PDF · 알바 4명 |
| 0-2 | Play 리스팅 vi 문안(§5) 검수 | 검수본 |
| Stage 1 준비 | 존 안 상습 침수 도로 20곳 목록(도로명 vi · 구간 · 평소 깊이) — 침수 페이지 1차 데이터 | 표 1장 |

### 대표
| # | 할 일 |
|---|---|
| 쇼츠 | 11/04 부터 주 2편. 포맷 = 오토바이 위 60초 "오늘 사이공 어디 잠겼나"(비 예보일) / 맑은 날은 정비소·주유소 한 곳 방문기. 베트남어 자막·보이스 = 히엔. 촬영 원본은 공유 폴더로 |
| 11/10 | 블로그 실험 4주차 판독 후 결정: 실험 유지 vs 조기 종료(랜딩 개편·TextMind 게시 시작) |
| 결정 | 침수 데이터 공공재 제공 상대(언론·아파트 관리위·대학) 1차 목록 승인 — §8 |

---

## 4. Stage 0 통과 기준 (11/03)
- [ ] 0-3 귀속 테스트 통과(설치→가입 소스 집계)
- [ ] 계정 3개 + 광고계정 승인
- [ ] 서치콘솔 사이트맵 제출 확인 + `/admin/fm` 봇 방문 수치 기록
- [ ] 공개 웹 레이어 1차 티켓 3개 등록·착수
- [ ] 업체 시딩: 알바 4명 모집 + 안내지 인쇄 + 첫 파일럿일 확정
- [ ] 법무 분류표 1장
- [x] `app_down.html` Android 분기 배포 · `robots.txt` AI 봇 허용 배포 (10/21 Claude)
- [x] 서치콘솔 소유 확인(DNS TXT 실측)

---

## 5. 문안 (검수 전 초안)

### 5-1. Play Console 리스팅 (스토어 승인 후 즉시 교체)
**짧은 설명(≤80자)**
- vi: `Báo ngập, tiệm sửa xe, chợ đồ cũ khu phố — ứng dụng cho tài xế Sài Gòn`
- ko: `침수 제보·정비소·동네 중고마켓 — 호치민 라이더의 동네 생활 앱`
- en: `Flood reports, repair shops, neighborhood secondhand — the Saigon rider app`

**전체 설명(앞 3문장이 노출된다)**
- vi: `Sài Gòn mưa — đường nào ngập, xem ngay trên Saigon Rider. Hàng xóm báo ngập theo thời gian thực, các đoạn đường hay ngập và trạm xăng, tiệm sửa xe gần bạn trên một bản đồ. Mua bán đồ cũ với hàng xóm cách 3km, hẹn gặp và giao dịch trực tiếp. (이하 6개 서비스 요약은 기존 문안 유지)`
- ko: `사이공에 비가 오면, 어느 길이 잠겼는지 사이공라이더에서 바로 확인하세요. 이웃의 실시간 침수 제보, 상습 침수 구간, 근처 주유소·정비소를 한 지도에서 봅니다. 3km 안 이웃과 중고거래, 약속 잡고 직접 만나 거래합니다.`
- en: `Rain in Saigon? See which streets are flooded right now on Saigon Rider. Real-time flood reports from neighbors, flood-prone roads, and nearby gas stations and repair shops on one map. Trade secondhand with neighbors within 3 km, meet and deal in person.`

### 5-2. 랜딩 홈 (실험 종료 후 적용 — 지금은 금지)
- hero.lead 앞 문장: vi `Sài Gòn mưa — đường nào ngập, xem ngay trên Saigon Rider.` / ko `사이공에 비가 오면, 어느 길이 잠겼는지 사이공라이더에서 바로 확인하세요.` / en `Rain in Saigon? See which streets are flooded right now on Saigon Rider.`
- 히어로 CTA 아래 Google Play 배지(`/images/badges/google-play-{locale}.png`, 저장소에 추가됨) → `href=/app_down.html`. iOS 안내: vi `Bản iOS đang chờ App Store phê duyệt` / ko `iOS 는 App Store 심사 중입니다` / en `iOS version is awaiting App Store review`.

---

## 6. 업체 시딩 안내지 — "내 가게가 Google 에 올라갑니다" (한글 마스터 → 히엔 번역·검수)

**앞면(한 장)**
- 제목: `Cửa hàng của bạn lên Google — miễn phí` (당신 가게가 Google 에 — 무료)
- 한 줄: 사이공라이더에 가게를 등록하면 `saigon-rider.com/b/<가게>` 페이지가 생기고, Google 에서 가게 이름·업종·동네로 검색될 때 그 페이지가 나옵니다. 앱 지도에도 핀이 찍힙니다.
- 3단계: ① QR 로 Zalo 로그인(2분) ② 가게 이름·주소·사진·영업시간 입력(5분) ③ 운영진 확인 후 페이지 공개 — 공개되면 Zalo 로 Google 검색 캡처를 보내 드립니다.
- 비용: 등록·페이지·지도 핀 전부 무료. 광고는 나중에, 원할 때만.
- 사장님이 받는 것: 가게 전용 QR 스티커(`app_down.html?src=qr-biz-<코드>`), 소식·가격표·후기 관리 화면.
- 문의: 히엔 Zalo 번호.

**뒷면**: 등록 예시 화면 1장 + "검수 통과 전엔 공개되지 않습니다 · 가짜 정보는 삭제됩니다" + 개인정보 한 줄.

**현장 대본(알바)**: 8월 계획의 접촉형 대본 그대로, 첫 문장만 교체 — "사장님, 가게를 Google 에 무료로 올려 드리러 왔습니다. 2분이면 됩니다."

---

## 7. 법무 질문지 (히엔 → 현지 법무, 1회)

1. **판촉(khuyến mại)**: ⓐ 앱 활동으로 쌓이는 포인트(RP, 양도·환급 불가)를 커피 쿠폰 등으로 교환하는 프로그램 — 시행령 81/2018(128/2024·239/2026 개정) 상 "khách hàng thường xuyên" 형태로 Sở Công Thương 신고 대상인지, 면제 조건(총 가치 1억 VND 미만)이 적용되는지. ⓑ "첫 침수 제보"·"매물 등록" 보상(RP·배지)이 판촉에 해당하는지. ⓒ 추첨 이벤트를 할 경우 등록 절차·기간. ⓓ 경품 50% 상한의 "판매가" 기준이 무료 앱에서는 어떻게 적용되는지.
2. **인플루언서(KOC) 계약**: 2026-01-01 광고법 개정에 맞는 계약서 필수 조항(실사용 확인·광고 표기 문구·세무). 계약 주체가 한국 법인 GOODIS 일 때 원천징수·지급 방식.
3. **기상수문법**: 사용자 제보 집계(사실)·과거 통계(상습 구간)·공식 경보 전달(출처 표기)을 공개 웹페이지·임베드 위젯으로 제공하는 것이 "예보·경보 활동 허가" 대상에 해당하는지. 자체 예측 모델 결과를 **앱 내부에서만** 보여주는 것은 가능한지, 어떤 문구(tham khảo)가 필요한지.
4. **개인정보(13/2023)**: 공개 페이지에 업체 정보(사장 동의), 매물(닉네임·동 단위 위치), 침수 제보(익명 집계)를 싣는 범위. 분석 SDK(Firebase) 추가 시 방침 갱신 항목.
5. **사업자 등록 없는 노점·가정 업체**의 프로필 공개 가능 여부와 표기.

---

## 8. 침수 공공재 제공 — 1차 상대 목록(대표 승인 요청, Stage 1 시작 전)
- 언론: Tuổi Trẻ · Thanh Niên · Zing 의 호치민 교통·도시 담당(비 오는 날 "어디 잠겼나" 데이터 제공, 출처 "Saigon Rider").
- 존 안 아파트 관리위(Zalo 그룹) 10곳 · 대학 학생회 3곳(빈탄 자취촌 인접).
- Facebook 그룹: 푸년·빈탄 주민 그룹, Grab 공식 기사 그룹(호치민 2륜) — 유틸리티 공유만.

---

## 9. 단톡방 문안 (대표·이광빈 대표·권도일·히엔)

```
[사이공라이더] 베트남 홍보 Stage 0 착수 공유드립니다 (10/21)

대표님 승인 사항: 외부 지출 총액 6,000만 VND 상한 · 대표님 쇼츠 주 2편 · 권도일님 2~3주 공개 웹 레이어 우선.

방향 한 줄: 광고로 사람을 사오는 대신, 침수·정비소·업체·매물 데이터를 Google 과 AI 가 읽는 공개 페이지로 내보내고(FactMind 이식 fm 레이어 확장), 사장님들이 자기 가게 페이지를 퍼뜨리게 합니다. 유료 광고는 측정 실험(280만 VND)만.

오늘 처리: app_down.html 이 Android 에서 바로 Google Play 로 가도록 배포 · robots 에 AI 봇 허용 · 서치콘솔 소유 확인 실측.

부탁드립니다 (11/03 까지)
· 권도일님: 설치 귀속(Install Referrer+Firebase) · 서치콘솔 사이트맵 확인 · 설계서 티켓화 · Zalo 승인/UrBox 상태 3줄
· 히엔 선생님: Facebook·Zalo OA·TikTok 계정 개설 · 법무 질문지 상담 · 시딩 안내지 검수 · 상습 침수 도로 20곳
· 대표님: 11/04 부터 쇼츠 주 2편 · 11/10 블로그 실험 판독 후 랜딩 개편 결정

상세: ai-docs/task/active/261021_stage0_promotion_kickoff.md
```
