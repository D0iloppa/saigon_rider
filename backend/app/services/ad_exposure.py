"""제휴 광고 가중 노출 스케줄러 (148).

균등 라운드로빈 대신 등급(exposure_tier) + 과금액(ad_fee) 비례 가중 노출을 계산한다.
순수 함수 — DB/ORM/랜덤/시간에 의존하지 않는다(같은 입력 → 같은 출력, 완전 결정적).
입력은 `.exposure_tier: str`, `.ad_fee: int` 속성만 요구(duck-typed) — 모델 결합 없음.

## 가중 공식 (불변식을 못박는 정수 밴드 방식)

    tier_ordinal = {BRONZE:0, SILVER:1, GOLD:2}      # 높을수록 상위
    spread       = len(ads) + 1                       # tier 밴드 폭(아래 근거)
    fee_bonus    = 동급 내 ad_fee 오름차순 dense rank (0-base)  # 동일 fee → 동일 bonus
    weight       = tier_ordinal * spread + fee_bonus + 1

`fee_bonus` 는 한 tier 내 서로 다른 ad_fee 개수보다 작으므로 항상 `< len(ads) <= spread`.
따라서 tier 밴드가 겹치지 않는다:
    BRONZE ∈ [1, spread],  SILVER ∈ [spread+1, 2*spread],  GOLD ∈ [2*spread+1, 3*spread]

이로써 3불변식이 공식 자체로 보장된다:
    (a) tier 지배 — 임의의 GOLD weight > 임의의 SILVER weight > 임의의 BRONZE weight
        (밴드 비겹침). 동수(同數) tier 비교 시 총 노출량도 상위 >= 하위.
    (b) 동급 fee 엄격 단조 — 같은 tier 내 ad_fee 가 크면 dense rank 가 크므로 weight 가 strictly 큼
        (동일 fee 는 동일 weight — 정당).
    (c) 완전 결정적 — 정수 산술 + 안정 정렬만 사용.

## 로테이션 시퀀스

smooth weighted round-robin(nginx upstream 방식) 으로 각 광고가 weight 회 등장하되
같은 광고가 인접하지 않게 고르게 분산된 시퀀스를 만든다. 한 full cycle 길이 = sum(weight).
argmax tie-break 는 입력 인덱스(작은 쪽) — 입력 정렬 순서가 결정적 tiebreak 로 보존된다.

시퀀스는 안전 상한 MAX_SEQUENCE_LENGTH 로 캡(무한 방지). 상한 초과 시 balanced 시퀀스를
앞에서 자른다 — smooth WRR 은 "가장 밀린(most-owed) 광고 우선" 선택이라, 임의 prefix 에서도
상위 weight 광고가 하위 weight 광고보다 적게 등장하지 않는다(역전 없음, 실측 검증).
(이 시퀀스는 화면 로테이션용 표시 순서일 뿐 — 과금·집계 지표가 아니다.)

## 절단이 불변식에 미치는 영향 (캡 근거)

- (a) tier 지배 + 역전 없음: 캡과 무관하게 항상 유지(절단 4000 trial 위반 0 — test_ad_exposure 참조).
- (b) 동급 fee 엄격 단조: gcd 축소 후 Σweight <= MAX_SEQUENCE_LENGTH (= 절단 미발생)일 때만 완전
  보장. 그 이상이면 절단으로 strict → `>=` 로 완화된다(단 역전·tier위반은 없음).
  fee 분화된 카탈로그 기준 대략 광고 N<=6~9 까지 strict 완전 보장(worst-case 전부 고유 fee: N<=6,
  tier 균등 혼합: N<=9). 그 이상 규모에선 동급 미세 fee 차가 표시 시퀀스에서 동률로 붕괴될 수 있다.

MAX_SEQUENCE_LENGTH=120 근거: /market/ads 는 이 시퀀스를 그대로 리스트로 반환하므로 캡 = 반환
MarketplaceAdOut(이미지 포함) 최대 개수 = 페이로드 상한. 광고는 피드 6칸당 1개 노출이라, 한 세션
깊은 스크롤(피드 ~200칸 ≈ 광고 ~33회)을 3~4배 상회하는 120 이면 세션 내 시각적 반복 없이 가중
패턴이 모두 표현되고, 프론트의 위치기반 순환(`ads[ord % len]`)은 항상 비례 prefix 를 본다. 1024
대비 페이로드 ~8배 경감. 광고가 실제로 tier/fee 로 분화될수록 Σweight 가 커져 이 캡이 유의미해진다.
"""

from __future__ import annotations

from math import gcd
from typing import Protocol

TIER_ORDINAL = {"BRONZE": 0, "SILVER": 1, "GOLD": 2}
_DEFAULT_ORDINAL = 0  # 미지의 tier 값은 최하위로 취급(회귀 안전)

# 반환 시퀀스(= /market/ads 페이로드) 길이 상한. 초과 시 balanced prefix 로 절단.
# 근거·절단 시 불변식 영향은 모듈 docstring "절단이 불변식에 미치는 영향" 참조.
MAX_SEQUENCE_LENGTH = 120


class _Weightable(Protocol):
    exposure_tier: str
    ad_fee: int


def compute_weights[T: _Weightable](ads: list[T]) -> list[int]:
    """각 광고의 정수 노출 weight(>=1). 인덱스는 입력과 1:1 대응."""
    spread = len(ads) + 1

    # tier 별 fee dense rank(오름차순, 0-base). 동일 fee → 동일 rank.
    tier_fees: dict[str, list[int]] = {}
    for ad in ads:
        tier_fees.setdefault(ad.exposure_tier, []).append(ad.ad_fee)
    tier_fee_order: dict[str, dict[int, int]] = {}
    for tier, fees in tier_fees.items():
        distinct = sorted(set(fees))
        tier_fee_order[tier] = {fee: rank for rank, fee in enumerate(distinct)}

    weights: list[int] = []
    for ad in ads:
        ordinal = TIER_ORDINAL.get(ad.exposure_tier, _DEFAULT_ORDINAL)
        bonus = tier_fee_order[ad.exposure_tier][ad.ad_fee]
        weights.append(ordinal * spread + bonus + 1)
    return weights


def build_exposure_sequence[T: _Weightable](ads: list[T]) -> list[T]:
    """가중 로테이션 시퀀스(반복 허용)를 반환. 입력이 비면 빈 리스트."""
    if not ads:
        return []
    if len(ads) == 1:
        return [ads[0]]

    weights = compute_weights(ads)

    # 비율 보존하며 주기 축소(exact) — 이후 smooth WRR 의 full cycle 을 짧게 만든다.
    g = 0
    for w in weights:
        g = gcd(g, w)
    if g > 1:
        weights = [w // g for w in weights]

    total = sum(weights)
    length = min(total, MAX_SEQUENCE_LENGTH)

    # smooth weighted round-robin (nginx upstream). argmax tie-break = 낮은 인덱스.
    current = [0] * len(ads)
    sequence: list[T] = []
    for _ in range(length):
        best = 0
        for i in range(1, len(ads)):
            if current[i] + weights[i] > current[best] + weights[best]:
                best = i
        for i in range(len(ads)):
            current[i] += weights[i]
        current[best] -= total
        sequence.append(ads[best])
    return sequence
