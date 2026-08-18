"""016 §5-2 #19 — 규칙 기반 랭킹 v1.

score = freshness_decay(bumped_at, 반감기 72h) x quality(사진·설명·인증·서류) x trust_penalty

전부 하드코딩(B2) — **이 파일 한 곳에 모아** L2 진입 시 TRUST_PENALTY 값만 바꾸면 "추천순"
노출이 즉시 재조정된다(§9 완료조건: "새 시스템 구축이 아니라 상수 변경"). 조회수 가중은
의도적으로 넣지 않는다(#16 데이터 축적 후의 몫 — 016 §9 제약).

정렬은 SQL 표현식으로 계산해 order_by 에 직접 꽂는다 — Python 에서 전건을 끌어와 정렬하면
offset/limit 페이지네이션이 깨지므로 market.py get_listings 의 기존 offset/limit 구조를
그대로 유지한다.
"""

# 최신성 반감기(시간) — bumped_at 기준(끌올 포함, #36 기존 컬럼 재사용).
FRESHNESS_HALF_LIFE_HOURS = 72.0

# 품질 가산 — 매물 자체 정보량이 클수록 가산(합산 방식, 상한 없음).
QUALITY_PHOTO_BONUS = 0.15
QUALITY_DESC_MIN_LEN = 30
QUALITY_DESC_BONUS = 0.05
QUALITY_PHONE_VERIFIED_BONUS = 0.15
# 016 §4-6 #41: 서류·명의 기재(선택 표시) 매물 가산 — 미기재는 감점이 아니라 "기재분만 가산 없음".
QUALITY_PAPER_STATUS_BONUS = 0.10

# 이상신호(#39)·업자 라벨(#40) 판정이 쌓이기 전까지는 1.0(무효과) — L2 파일럿 진입 시 이 값만
# listing 단위 감산 계수로 조정한다. 지금은 전역 상수.
TRUST_PENALTY = 1.0


def recommended_score_sql() -> str:
    """ "추천순" 정렬 SQL 표현식 문자열. literal_column() 으로 감싸 order_by 에 사용한다.

    marketplace_listings 테이블 별칭 없이 그대로 참조하므로, 이 표현식을 쓰는 쿼리는
    반드시 MarketplaceListing 을 FROM 절에 직접 갖고 있어야 한다(market.py get_listings 기준).
    """
    return f"""
        POWER(0.5, EXTRACT(EPOCH FROM (now() - marketplace_listings.bumped_at)) / 3600.0 / {FRESHNESS_HALF_LIFE_HOURS})
        * (
            1.0
            + CASE WHEN EXISTS (
                SELECT 1 FROM marketplace_listing_images mli WHERE mli.listing_id = marketplace_listings.id
              ) THEN {QUALITY_PHOTO_BONUS} ELSE 0 END
            + CASE WHEN LENGTH(COALESCE(marketplace_listings.description, '')) >= {QUALITY_DESC_MIN_LEN}
              THEN {QUALITY_DESC_BONUS} ELSE 0 END
            + CASE WHEN EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = marketplace_listings.seller_id AND u.phone_verified_at IS NOT NULL
              ) THEN {QUALITY_PHONE_VERIFIED_BONUS} ELSE 0 END
            + CASE WHEN marketplace_listings.paper_status IS NOT NULL THEN {QUALITY_PAPER_STATUS_BONUS} ELSE 0 END
        )
        * {TRUST_PENALTY}
    """
