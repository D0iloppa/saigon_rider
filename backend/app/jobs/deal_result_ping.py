"""문의 후 조용해진 매물에 거래 결과 확인 핑 — 016 §4-7 #42.

deal_complete(약속 완료)는 자기신고라 누락률이 높다. 문의(dm_conversations, context_type=
'listing')를 받았지만 최근 _QUIET_PERIOD 동안 대화가 없는 ON_SALE 매물의 판매자에게 4지선다
1탭 알림을 보낸다: ①거래됨 ②아직 판매중 ③다른 데서 판매 ④판매 포기. 응답은 market.py 의
respond_deal_result 가 상태 전이(log_transition 경유)·deal_result_ping_log 에 반영한다.

_QUIET_PERIOD=5일 — 근거: 앱 내 DM 응답 SLA 는 별도로 없지만, 대면 거래가 보통 문의 후
2~3일 내 성사되는 시장 특성(016 §4-7 서술)을 감안해 "느슨하게 조용함"을 5일로 잡았다.
너무 짧으면(예: 1~2일) 정상 흥정 중인 매물까지 찔러 판매자 피로도를 올리고, 너무 길면
(2주+) 유동성 지표 보정 효과가 늦어진다 — 실측 데이터 없는 파일럿 단계의 잠정값(하드코딩,
B2와 동일 취지)이며 파일럿 응답률을 보고 조정한다.

expire_stale_listings(01:00)·title_transfer_reminders(01:05) 다음 순번(01:10 ICT, main.py)으로
등록해 매물 배치 잡들과 시간대를 모은다. title_transfer_reminders.py 와 동일하게
pg_insert ... on_conflict_do_nothing 으로 중복 발송을 막는다(deal_result_ping_log UNIQUE
listing_id — 매물당 평생 1회만 발송, 재발송 종류가 없다는 점이 title_transfer 와 다르다).
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..database import AsyncSessionLocal
from ..models import DealResultPingLog, DmConversation, MarketplaceListing
from ..services import noti_events

log = logging.getLogger(__name__)

_QUIET_PERIOD = timedelta(days=5)


async def _find_quiet_listings(db):
    cutoff = datetime.now(UTC) - _QUIET_PERIOD
    last_msg_subq = (
        select(
            DmConversation.context_id.label("listing_id"),
            func.max(DmConversation.last_message_at).label("last_msg_at"),
        )
        .where(DmConversation.context_type == "listing")
        .group_by(DmConversation.context_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(MarketplaceListing.id, MarketplaceListing.seller_id, MarketplaceListing.title)
            .join(last_msg_subq, last_msg_subq.c.listing_id == MarketplaceListing.id)
            .outerjoin(DealResultPingLog, DealResultPingLog.listing_id == MarketplaceListing.id)
            .where(
                MarketplaceListing.status == "ON_SALE",
                last_msg_subq.c.last_msg_at <= cutoff,
                DealResultPingLog.id.is_(None),
            )
        )
    ).all()
    return rows


async def send_deal_result_pings() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            due = await _find_quiet_listings(db)
            for listing_id, seller_id, title in due:
                inserted_id = await db.scalar(
                    pg_insert(DealResultPingLog)
                    .values(listing_id=listing_id)
                    .on_conflict_do_nothing(index_elements=[DealResultPingLog.listing_id])
                    .returning(DealResultPingLog.id)
                )
                if inserted_id is None:
                    continue  # 동시 실행 등으로 이미 발송됨
                noti_events.enqueue(
                    db,
                    "market.deal_result_ping",
                    {"user_id": str(seller_id), "listing_id": str(listing_id), "title": title},
                )
            await db.commit()
        return True
    except Exception:
        log.exception("Deal result ping batch failed")
        return False
