"""서버 생성 알림 문안의 단일 지역화 지점.

서버가 만드는 푸시/인앱 알림은 수신자 언어로 나가야 한다. 기준은 `users.preferred_lang`
(221, 앱이 언어를 바꿀 때 동기화). 값이 없으면 앱 기본 언어인 `vi` 로 폴백한다.

새 문안을 추가할 때는 여기 TEXTS 에 키를 만들고 호출부는 `t()` 만 쓴다 — 호출부에 한국어
문자열을 직접 박으면 지역화 지점이 다시 흩어진다.
"""

import uuid

from sqlalchemy import select

from app.models import User
from app.services.translate import SUPPORTED_LANGS

DEFAULT = "vi"


def normalize(lang: str | None) -> str:
    """'ko-KR' → 'ko', 미지원/미설정 → DEFAULT."""
    if not lang:
        return DEFAULT
    base = lang.split("-")[0].lower()
    return base if base in SUPPORTED_LANGS else DEFAULT


TEXTS: dict[str, dict[str, str]] = {
    # 키워드 알림 — 제목만으로 무슨 일인지 알 수 있게 문장으로, 본문은 매물 제목만(대표 확정).
    "keyword_alert.title": {
        "ko": "'{keyword}' 상품이 등록되었습니다",
        "en": "New listing for '{keyword}'",
        "vi": "Có tin đăng mới cho '{keyword}'",
    },
    # 거래 Live Activity 카드 문구 — 클라이언트 i18n(dm.laStatus.*) 과 같은 문장. 서버가 만들어
    # 보내므로 토큰 등록 시 저장된 locale 로 고른다. 위젯은 문장을 만들지 않는다(네이티브 무문구 원칙).
    "la_deal.accepted": {"ko": "약속 확정", "en": "Meetup confirmed", "vi": "Đã chốt hẹn"},
    "la_deal.completionRequested": {"ko": "완료 요청됨", "en": "Completion requested", "vi": "Đã yêu cầu hoàn tất"},
    "la_deal.completed": {"ko": "거래 완료", "en": "Deal completed", "vi": "Giao dịch hoàn tất"},
    "la_deal.cancelled": {"ko": "약속 취소", "en": "Meetup cancelled", "vi": "Đã hủy hẹn"},
    # 약속 이동 알림 — 수신자는 상대방 한 명이며, 출발/도착 사실만 전달한다.
    "appointment_travel.departure.title": {
        "ko": "약속 이동 알림",
        "en": "Meetup travel update",
        "vi": "Cập nhật di chuyển cuộc hẹn",
    },
    "appointment_travel.departure.body": {
        "ko": "상대방이 출발했어요.",
        "en": "Your meetup partner has departed.",
        "vi": "Người hẹn gặp đã khởi hành.",
    },
    "appointment_travel.arrival.title": {
        "ko": "약속 이동 알림",
        "en": "Meetup travel update",
        "vi": "Cập nhật di chuyển cuộc hẹn",
    },
    "appointment_travel.arrival.body": {
        "ko": "상대방이 약속 장소에 도착했어요.",
        "en": "Your meetup partner has arrived at the meeting place.",
        "vi": "Người hẹn gặp đã đến điểm hẹn.",
    },
    "appointment_cancelled.title": {
        "ko": "약속이 취소되었어요",
        "en": "Meetup cancelled",
        "vi": "Cuộc hẹn đã bị hủy",
    },
    "appointment_cancelled.body": {
        "ko": "'{title}' 약속이 취소되었어요.",
        "en": "The meetup for '{title}' was cancelled.",
        "vi": "Cuộc hẹn cho '{title}' đã bị hủy.",
    },
    "appointment_cancelled.body_with_reason": {
        "ko": "'{title}' 약속이 취소되었어요 · {reason}",
        "en": "The meetup for '{title}' was cancelled · {reason}",
        "vi": "Cuộc hẹn cho '{title}' đã bị hủy · {reason}",
    },
    # F-X-01 FR-1(260924 승인안) 취소 사유 칩 — 상대 알림 문구에 그대로 들어간다.
    "cancel_reason.SCHEDULE_CHANGED": {
        "ko": "일정이 바뀌었어요",
        "en": "My schedule changed",
        "vi": "Lịch của tôi thay đổi",
    },
    "cancel_reason.TRADED_ELSEWHERE": {
        "ko": "다른 곳에서 거래했어요",
        "en": "Already traded elsewhere",
        "vi": "Đã giao dịch nơi khác",
    },
    "cancel_reason.UNREACHABLE": {
        "ko": "연락이 안 돼요",
        "en": "Could not reach them",
        "vi": "Không liên lạc được",
    },
    # F-X-01 FR-2(260924 승인안) — 교착(PAYMENT_REPORTED) 출구 흐름.
    "payment_report_cancelled.title": {
        "ko": "송금 신고가 취소됐어요",
        "en": "Payment report withdrawn",
        "vi": "Đã hủy báo chuyển tiền",
    },
    "payment_report_cancelled.body": {
        "ko": "'{title}' 거래에서 구매자가 송금 신고를 취소했어요.",
        "en": "The buyer withdrew their payment report for '{title}'.",
        "vi": "Người mua đã hủy báo chuyển tiền cho '{title}'.",
    },
    "transaction_cancel_requested.title": {
        "ko": "거래 취소를 요청받았어요",
        "en": "Cancellation requested",
        "vi": "Có yêu cầu hủy giao dịch",
    },
    "transaction_cancel_requested.body": {
        "ko": "'{title}' 거래 취소를 요청받았어요 · {reason}",
        "en": "A cancellation was requested for '{title}' · {reason}",
        "vi": "Có yêu cầu hủy giao dịch '{title}' · Lý do: {reason}",
    },
    "transaction_cancel_rejected.title": {
        "ko": "거래 취소 요청이 거절됐어요",
        "en": "Cancellation request rejected",
        "vi": "Yêu cầu hủy giao dịch bị từ chối",
    },
    "transaction_cancel_rejected.body": {
        "ko": "'{title}' 거래 취소 요청이 거절됐어요 · 고객센터로 문의해 주세요.",
        "en": "Your cancellation request for '{title}' was rejected. Please contact support.",
        "vi": "Yêu cầu hủy giao dịch '{title}' bị từ chối. Vui lòng liên hệ hỗ trợ.",
    },
    "transaction_cancel_agreed.title": {
        "ko": "거래가 취소됐어요",
        "en": "Transaction cancelled",
        "vi": "Giao dịch đã bị hủy",
    },
    "transaction_cancel_agreed.body": {
        "ko": "'{title}' 거래가 합의로 취소되고 매물이 판매중으로 돌아갔어요.",
        "en": "'{title}' was cancelled by mutual agreement and the listing is back on sale.",
        "vi": "Giao dịch '{title}' đã bị hủy theo thỏa thuận, tin đăng đã trở lại trạng thái đang bán.",
    },
    "transaction_cancel_expired.title": {
        "ko": "거래가 자동으로 취소됐어요",
        "en": "Transaction auto-cancelled",
        "vi": "Giao dịch đã tự hủy",
    },
    "transaction_cancel_expired.body": {
        "ko": "응답이 없어 '{title}' 거래가 자동으로 취소됐어요.",
        "en": "'{title}' was auto-cancelled after no response.",
        "vi": "Không có phản hồi nên giao dịch '{title}' đã tự hủy.",
    },
    "transaction_stalled.title": {
        "ko": "문제가 있나요?",
        "en": "Having trouble?",
        "vi": "Có vấn đề?",
    },
    "transaction_stalled.body": {
        "ko": "'{title}' 거래가 오래 멈춰 있어요 — 거래 화면에서 취소 출구를 확인해 보세요.",
        "en": "'{title}' has been stuck for a while — check the exit options on the trade screen.",
        "vi": "Giao dịch '{title}' đã đứng yên khá lâu — hãy kiểm tra lối thoát hủy trên màn hình giao dịch.",
    },
}

# TODO: 아직 한국어 하드코딩으로 남은 서버 문안 — 이관 시 여기 키를 추가하고 호출부를 t() 로 바꾼다.
# (전부 noti_worker/__main__.py)
#   _handle_dm_message              : "새 메시지" (발신자 닉네임 폴백)
#   _handle_price_drop              : "찜한 매물의 가격이 내렸어요: …"
#   _handle_biz_profile_reviewed    : _BIZ_PROFILE_COPY 승인/반려 문안
#   _handle_biz_ad_reviewed         : _BIZ_AD_COPY 승인/반려 문안
#   _handle_proximity_hit           : "근처 가게 알림" 폴백
#   _handle_support_replied         : "고객센터 답변 도착"
#   _handle_completion_request      : 거래 완료 요청/거절 문안
#   _handle_report_submitted        : 신고 접수 문안
#   _handle_title_transfer_reminder : "명의이전 체크리스트" + _TITLE_TRANSFER_COPY
#   _handle_deal_result_ping        : "거래 결과를 알려주세요" / "'…' 매물, 거래되셨나요?"
#   _handle_feed_comment/like/followed_post/group_post : "새 댓글"·"새 응원"·"새 글" 폴백


def t(lang: str | None, key: str, **fmt: object) -> str:
    """`key` 문안을 `lang`(미지원 시 DEFAULT)으로 렌더링한다. 없는 키는 KeyError."""
    texts = TEXTS[key]
    return texts[normalize(lang)].format(**fmt)


async def langs_for_users(db, user_ids) -> dict[uuid.UUID, str]:
    """수신자들의 표시 언어를 한 번의 SELECT 로 조회 — 결과는 항상 정규화된 값."""
    ids = list(user_ids)
    if not ids:
        return {}
    rows = await db.execute(select(User.id, User.preferred_lang).where(User.id.in_(ids)))
    langs = {uid: normalize(lang) for uid, lang in rows.all()}
    return {uid: langs.get(uid, DEFAULT) for uid in ids}
