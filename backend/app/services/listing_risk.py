"""016 §4-4 #39 — 이상 신호 점수(risk_score).

risk_score = w1·가격이상도 + w2·계정신규도 + w3·지문재사용 + w4·연락처노출 + w5·금칙어근접

**용도는 오직 하나 — 010 #3 검수 큐(admin_api/listings.py list_listings)의 정렬 가중치.**
자동 숨김·차단·삭제는 절대 하지 않는다(M1 — 탐지 ≠ 차단). 판정은 사람(운영자)이 큐를 보고 한다.

가중치는 전부 하드코딩(B2) — 이 파일 한 곳에 모아 실측 후 조정한다. listing_ranking.py의
TRUST_PENALTY(랭킹, 사용자 노출 순서)와는 완전히 별개 개념이다 — 혼동 금지.

SQL 표현식 문자열(literal_column 으로 감싸 order_by/select 에 사용)만 제공한다 — 계정 신규도는
users 테이블을, 지문 재사용은 marketplace_listing_images/contents/content_fingerprint_whitelist
를 상관 서브쿼리로 참조하므로, 이 표현식을 쓰는 쿼리는 marketplace_listings 를 FROM 절에 직접
가져야 한다(listing_ranking.recommended_score_sql 과 동일한 제약).
"""

# 가중치(B2 하드코딩, 016 §4-4) — 5신호 합이 1이 되도록 초기 배분한 잠정값. 실측 전 근거:
# 가격 이상도·지문 재사용은 "이미 벌어진 일"의 직접 증거라 비중을 높게(0.30/0.25), 계정
# 신규도는 정황 증거라 중간(0.20), 연락처 노출·금칙어 근접은 정상 거래에서도 흔히 등장하는
# 문구라(예: 판매자가 먼저 전화번호를 공개하는 경우) 오탐 위험이 커서 낮게(0.15/0.10) 잡았다.
WEIGHT_PRICE_ANOMALY = 0.30
WEIGHT_ACCOUNT_NEWNESS = 0.20
WEIGHT_FINGERPRINT_REUSE = 0.25
WEIGHT_CONTACT_EXPOSURE = 0.15
WEIGHT_BANNED_PROXIMITY = 0.10

# 가격 이상치 v0(016 §4-4 표): 카테고리당 표본 이 미만이면 중앙값이 불안정하므로 아예
# 신호를 0으로 둔다(경보 없음) — "표본 미달 카테고리는 경보를 내지 않는다"의 SQL 구현.
PRICE_ANOMALY_MIN_CATEGORY_SAMPLE = 20

# 계정 신규도 창(일): 가입 경과일이 0이면 신호 1.0, 이 값 이상이면 0.0 으로 선형 감쇠.
ACCOUNT_NEWNESS_WINDOW_DAYS = 14

# 선입금 유도 문구(§4-4 서술 예시: "chuyển khoản trước") — banned_keywords.py(등록 자체를
# 차단하는 금칙어)와는 목적이 다르다(이건 차단이 아니라 정렬 가중치 신호), 그래서 별도 하드코딩
# 리스트로 둔다. 무성조 변형도 포함(검색 정규화 트리거 전이라 원문 그대로 매칭).
BANNED_PROXIMITY_PATTERNS = [
    "chuyển khoản trước",
    "chuyen khoan truoc",
    "đặt cọc trước",
    "dat coc truoc",
]


def _ilike_any_sql(column: str, phrases: list[str]) -> str:
    conditions = " OR ".join(f"{column} ILIKE '%{phrase}%'" for phrase in phrases)
    return f"({conditions})"


def risk_score_sql() -> str:
    banned_title = _ilike_any_sql("marketplace_listings.title", BANNED_PROXIMITY_PATTERNS)
    banned_desc = _ilike_any_sql("COALESCE(marketplace_listings.description, '')", BANNED_PROXIMITY_PATTERNS)

    return f"""
        {WEIGHT_PRICE_ANOMALY} * (
            CASE WHEN marketplace_listings.category_id IS NOT NULL AND (
                SELECT count(*) FROM marketplace_listings cat_sample
                WHERE cat_sample.category_id = marketplace_listings.category_id
            ) >= {PRICE_ANOMALY_MIN_CATEGORY_SAMPLE}
            THEN GREATEST(0, LEAST(1,
                (
                    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cat_median.price_vnd)
                     FROM marketplace_listings cat_median
                     WHERE cat_median.category_id = marketplace_listings.category_id)
                    - marketplace_listings.price_vnd
                ) / NULLIF(
                    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cat_median.price_vnd)
                     FROM marketplace_listings cat_median
                     WHERE cat_median.category_id = marketplace_listings.category_id),
                    0
                )
            ))
            ELSE 0 END
        )
        + {WEIGHT_ACCOUNT_NEWNESS} * (
            GREATEST(0, LEAST(1,
                1.0 - EXTRACT(EPOCH FROM (
                    now() - (SELECT u.created_at FROM users u WHERE u.id = marketplace_listings.seller_id)
                )) / 86400.0 / {ACCOUNT_NEWNESS_WINDOW_DAYS}
            ))
        )
        + {WEIGHT_FINGERPRINT_REUSE} * (
            CASE WHEN (
                marketplace_listings.text_fingerprint IS NOT NULL AND EXISTS (
                    SELECT 1 FROM marketplace_listings fp_dup
                    WHERE fp_dup.id <> marketplace_listings.id
                    AND fp_dup.text_fingerprint = marketplace_listings.text_fingerprint
                )
            ) OR EXISTS (
                SELECT 1 FROM marketplace_listing_images mli
                JOIN contents c ON c.id = mli.content_id
                WHERE mli.listing_id = marketplace_listings.id
                AND c.phash IS NOT NULL
                AND c.phash NOT IN (SELECT phash FROM content_fingerprint_whitelist)
                AND EXISTS (
                    SELECT 1 FROM marketplace_listing_images mli2
                    JOIN contents c2 ON c2.id = mli2.content_id
                    WHERE c2.phash = c.phash AND mli2.listing_id <> marketplace_listings.id
                )
            ) THEN 1 ELSE 0 END
        )
        + {WEIGHT_CONTACT_EXPOSURE} * (
            CASE WHEN marketplace_listings.title ~* '(0|\\+84)[0-9]{{8,10}}|zalo'
                 OR COALESCE(marketplace_listings.description, '') ~* '(0|\\+84)[0-9]{{8,10}}|zalo'
            THEN 1 ELSE 0 END
        )
        + {WEIGHT_BANNED_PROXIMITY} * (
            CASE WHEN {banned_title} OR {banned_desc} THEN 1 ELSE 0 END
        )
    """
