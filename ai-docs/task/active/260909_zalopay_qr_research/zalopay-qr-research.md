# ZaloPay 수동 QR 거래 연계 조사

상태: 조사 완료 · 백엔드 최소 구현 완료 (frontend 연결·독립 리뷰 대기). 플랫폼 사례나 API 없는 결제 검증 가능성을 단정하지 않는다.

## Q1. ZaloPay QR 유형과 API 없는 연계 범위

- 확인: ZaloPay의 공식 QR 받기 안내는 사용자가 QR를 저장한 뒤 고객에게 공유해 지급을 요청할 수 있다고 안내한다. [공식 원문](https://zalopay.vn/dich-vu/qr-nhan-tien)
- 해석: QR 이미지 업로드·열람은 API 없는 수동 지급 요청 UX의 근거가 되지만, 이 출처만으로는 대상 거래의 결제 완료를 판정할 수 없다.
- 구별: 공식 정적 가맹점 QR는 Merchant Portal에 등록해 지점·매장·카운터를 설정하는 무코드 수납 상품이다. 판매자 개인 QR 파일과 혼동하지 않는다. [공식 Docs](https://docs.zalopay.vn/vi/docs/guides/payment-acceptance/qrcode/static-qr/)

## Q2. 베트남 플랫폼의 실제 사례

- Chợ Tốt 공식 운영정책의 인덱스 결과는 구매자–판매자 간 지급에 플랫폼이 참여하지 않는다고 밝힌다. 직접 원문 열기는 timeout이어서, 이 인덱스 발췌 밖의 세부 문언은 인용하지 않는다. [공식 정책 URL](https://trogiup.chotot.com/nguoi-ban/hoat-dong-ung-dung/)
- 결론: 공식 자료에서 판매자가 거래 안에 QR 이미지를 업로드·공유하는 내장 기능 사례는 확인하지 못했다. 그런 선례가 있다고 주장하지 않는다.

## Q3. 동일 기기 사용법과 안전 안내

- 공식 확인 범위: ZaloPay의 수취 QR 안내는 QR를 저장하고 고객에게 공유하는 단계까지만 확인된다. [공식 안내](https://zalopay.vn/dich-vu/qr-nhan-tien)
- 미확인: ZaloPay 공식 사용자 문서에서 구매자가 **같은 기기**의 사진 보관함에서 QR 이미지를 불러와 스캔하는 절차는 찾지 못했다. 따라서 이 UX를 제품 요구사항 또는 지원 사실로 주장하지 않는다.
- 안전 안내: 외부 송금은 거래 참여자 사이의 사적 약정이다. QR 이미지 표시·저장·"송금했음" 신고는 모두 결제 증명이 아니며 자동 `PAID`/거래완료 상태 전이를 일으키면 안 된다. 수취인 이름·계좌/지갑 대상·금액은 구매자가 송금 전에 별도로 대조해야 한다.

## Q4. 기존 시스템 최소 설계와 검증

### 확인한 기존 경계

- 거래 완료는 `MarketplaceAppointment` 흐름의 `request_appointment_completion`(구매자 요청)과 `complete_appointment`(판매자 확정)에 이미 분리돼 있다. QR은 이 상태기계를 우회하거나 `COMPLETED`/`SOLD`를 직접 바꾸면 안 된다.
- DM은 이미 `contents/upload → image_content_id → DmMessage` 흐름과 대화 멤버 접근검사를 갖고 있다. 따라서 QR 파일을 공개 매물 이미지에 붙일 이유가 없다.

### 구현한 최소 경계

1. 거래에 연결된 1:1 대화의 **판매자만** 전용 `payment_qr` 경로로 등록한다. 일반 DM 경로는 해당 type과 private image attachment를 거절한다.
2. QR 파일은 기존 `contents` 중개와 `DmMessage.image_content_id`를 재사용하며, private seller-owned raster image만 받는다. 새 URL 컬럼·공개 매물 필드·결제 테이블은 만들지 않는다.
3. 서버는 `MarketplaceAppointment.conversation_id`·`listing_id`를 기준으로 멤버, 차단, 판매자, `ACCEPTED`/`RESERVED` 상태를 확인한다. one-per-pair DM의 legacy listing context에는 의존하지 않는다.
4. JSON에 imgproxy URL/file path를 포함하지 않고, 살아 있는 QR의 거래 참여자만 세션 인증 image endpoint에서 원본을 받는다. 교체 시 같은 appointment의 이전 QR 메시지는 소프트 삭제한다.
5. QR 등록·열람은 appointment/listing/payment 상태를 바꾸지 않는다. UI는 별도 연결 시 수취인·금액을 송금 전 대조하라는 안내를 표시해야 하며, "결제 완료" 버튼·자동 PAID·자동 완료 전이는 만들지 않는다.

### 예상 접점과 검증 기준

- Backend: `backend/app/routers/dm.py` 및 `backend/app/schemas.py` (전용 전송/인증 이미지/일반 경로 우회 차단). `backend/app/tests/test_dm_payment_qr.py` 14 isolated tests PASS.
- Frontend: `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/api/dm.ts`, `frontend/src/api/types.ts`.
- Tests: 판매자는 해당 거래 DM에서만 업로드 가능; 구매자/제3자/비연결 대화는 403; QR 열람 또는 "송금했음" 동작이 appointment/listing 상태를 바꾸지 않음; 콘텐츠는 공개 listing 응답에 포함되지 않음.
