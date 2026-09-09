# ZaloPay 수동 QR 거래 연계 — 핸드오프 원장

## 메타
- 지시자: 사용자
- 수행자: doil-supervise / doil-research 감독 및 순차 수집 워커
- 작업공간: /mnt/c/dev/saigon_rider/ai-docs/task/active/260909_zalopay_qr_research
- 정본 산출물: zalopay-qr-research.md
- 최종 갱신: 2026-09-09

## 목적
- 표면 지시: 베트남 중고거래 레퍼런스를 조사하고 판매자 ZaloPay QR 업로드·구매자 송금 안내를 구현한다.
- 실제 의도: PSP API 도입 없이 기존 상품거래 안에서 수취 QR을 안전하게 전달한다.
- 조사 스코프: 공식 사용법, 실제 플랫폼 사례, 동일 기기 이미지 스캔/저장 흐름, 수동 송금의 신뢰 한계. 자동 결제 승인·웹훅·에스크로는 제외한다.

## 조사질문
- Q1. 개인 ZaloPay 수취 QR과 가맹점 결제 QR은 어떤 차이가 있으며 API 없는 이미지 공유로 가능한 범위는 무엇인가?
- Q2. 베트남 중고거래 플랫폼의 판매자 QR 공유 사례를 공식 자료로 확인할 수 있는가?
- Q3. 모바일 동일 기기에서 QR 이미지를 이용하는 구매자 흐름과 안전 안내는 무엇인가?
- Q4. 기존 거래 권한·상태·이미지 저장 구조에 필요한 최소 변경과 검증 기준은 무엇인가?

## 단계 진행 상태
- [x] 1. 목적·범위·원장 초기화
- [x] 2. 공식 출처를 하나씩 수집하고 sources에 근거 저장 (3 sources; platform case includes a negative finding)
- [x] 3. 기존 거래 구조 조회 및 최소 설계 (graph 조회 완료; 구현 전 후보만 기록)
- [x] 4. 백엔드 구현·격리 회귀 검증 (frontend 연결·독립 리뷰 대기)

## 구현 상태 / 다음 착수 지점
- 백엔드는 전용 seller-only `payment_qr` 등록과 거래 참여자 인증 이미지 제공을 구현했다. 수락됨(`ACCEPTED`)·예약됨(`RESERVED`)인 약속, 약속의 `conversation_id`·`listing_id`, 대화 멤버/차단, 판매자 소유 private raster Content를 서버에서 검증한다.
- QR 응답에는 imgproxy URL/file path를 넣지 않으며, 삭제·교체된 QR은 인증 이미지 경로에서 제공하지 않는다. 일반 DM의 `payment_qr` type 위조와 private image 첨부도 거절한다.
- 백엔드 격리 테스트 14건 PASS (2026-09-09); frontend 인증 blob 표시·저장 UX와 독립 리뷰는 대기한다.
- 확인되지 않은 플랫폼 사례·동일기기 사진 gallery-scan은 지원 사실로 단정하지 않는다.

## 수집된 raw 소스
- [x] 01 ZaloPay — QR 받기: https://zalopay.vn/dich-vu/qr-nhan-tien (2026-09-09). 사용자가 QR를 저장하고 고객에게 공유하는 흐름을 공식 발견. 플랫폼의 결제 성공 검증은 언급되지 않음.
- [x] 02 ZaloPay Docs — static merchant QR: https://docs.zalopay.vn/vi/docs/guides/payment-acceptance/qrcode/static-qr/ (2026-09-09). 무코드 가맹점 QR이지만 Merchant Portal로 카운터를 설정하는 별도 상품. 개인 업로드 QR의 지급 인증 근거가 아님.
- [x] 03 Chợ Tốt Help — marketplace operating policy: https://trogiup.chotot.com/nguoi-ban/hoat-dong-ung-dung/ (2026-09-09). 공식 인덱스 결과에서 사용자 간 지급에 플랫폼이 개입하지 않는다고 밝힌다. 직접 fetch는 timeout이라 세부 문언은 재확인 필요. 판매자 QR 업로드 내장 기능 증거는 찾지 못함.

## 미해결 질문 / 주의
- 결제 API가 없으므로 QR 열람/저장/송금 의사만으로 PAID 또는 거래 완료 처리하지 않는다.
- QR 내용·수취인 진위는 이미지 업로드만으로 보증할 수 없다.
- 미확인: 실제 중고플랫폼의 판매자 QR 이미지 공유 내장 기능 선례는 확인되지 않았다.
- 이전 지도/광고결제 배포 마무리는 별도 작업이며 이 티켓의 배포 승인을 의미하지 않는다.
