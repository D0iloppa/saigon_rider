"""제휴 광고 가중 노출 스케줄러(148) 단위 테스트.

3불변식을 못박는다: (a) tier 지배, (b) 동급 fee 엄격 단조, (c) 완전 결정성.
+ 인접 분산, 빈/단일 edge, 절단(캡) 경로, 밴드 경계, 미지 tier 폴백, gcd 축소, 입력순서 tiebreak.
"""

import unittest
from collections import Counter
from dataclasses import dataclass

import app.services.ad_exposure as ad_exposure
from app.services.ad_exposure import build_exposure_sequence, compute_weights


@dataclass
class FakeAd:
    id: str
    exposure_tier: str
    ad_fee: int = 0


def _counts(seq):
    return Counter(a.id for a in seq)


class AdExposureTests(unittest.TestCase):
    def test_determinism_same_input_same_output(self):
        ads = [
            FakeAd("g", "GOLD", 5000),
            FakeAd("s1", "SILVER", 3000),
            FakeAd("s2", "SILVER", 1000),
            FakeAd("b", "BRONZE", 0),
        ]
        seq1 = [a.id for a in build_exposure_sequence(list(ads))]
        seq2 = [a.id for a in build_exposure_sequence(list(ads))]
        self.assertEqual(seq1, seq2)

    def test_tier_dominance_totals_equal_counts(self):
        # 동수 tier + 동일 fee → 상위 tier 총 노출량 >= 하위 tier.
        ads = [
            FakeAd("g", "GOLD", 0),
            FakeAd("s", "SILVER", 0),
            FakeAd("b", "BRONZE", 0),
        ]
        c = _counts(build_exposure_sequence(list(ads)))
        self.assertGreaterEqual(c["g"], c["s"])
        self.assertGreaterEqual(c["s"], c["b"])
        # 등급이 실제로 차등돼야 한다(전부 동일 금지).
        self.assertGreater(c["g"], c["b"])

    def test_tier_dominance_per_ad_weight_bands(self):
        # 임의의 GOLD weight > 임의의 SILVER weight > 임의의 BRONZE weight (fee 무관).
        ads = [
            FakeAd("g", "GOLD", 0),  # 최소 fee GOLD
            FakeAd("s", "SILVER", 10_000_000),  # 초고액 SILVER
            FakeAd("b", "BRONZE", 9_000_000),  # 고액 BRONZE
        ]
        w = compute_weights(ads)
        wg, ws, wb = w[0], w[1], w[2]
        self.assertGreater(wg, ws)
        self.assertGreater(ws, wb)

    def test_fee_strict_ordering_within_tier(self):
        # 동급 두 광고: ad_fee 큰 쪽이 strictly 더 많이 등장.
        ads = [
            FakeAd("low", "SILVER", 1000),
            FakeAd("high", "SILVER", 9000),
        ]
        c = _counts(build_exposure_sequence(list(ads)))
        self.assertGreater(c["high"], c["low"])

    def test_equal_fee_same_tier_equal_exposure(self):
        ads = [
            FakeAd("a", "GOLD", 5000),
            FakeAd("b", "GOLD", 5000),
        ]
        c = _counts(build_exposure_sequence(list(ads)))
        self.assertEqual(c["a"], c["b"])

    def test_adjacency_spread_equal_weights_no_run(self):
        # 동일 weight 3개 → 같은 광고가 연속 등장하지 않아야 한다.
        ads = [
            FakeAd("a", "GOLD", 100),
            FakeAd("b", "GOLD", 100),
            FakeAd("c", "GOLD", 100),
        ]
        seq = [a.id for a in build_exposure_sequence(list(ads))]
        for i in range(1, len(seq)):
            self.assertNotEqual(seq[i], seq[i - 1], f"adjacent duplicate at {i}: {seq}")

    def test_empty_list(self):
        self.assertEqual(build_exposure_sequence([]), [])

    def test_single_ad(self):
        ads = [FakeAd("only", "BRONZE", 0)]
        seq = build_exposure_sequence(list(ads))
        self.assertEqual([a.id for a in seq], ["only"])

    # ── 절단(캡) 경로 ────────────────────────────────────────────────
    def test_cap_truncation_preserves_tier_dominance_and_no_inversion(self):
        # N 이 커서 Σweight > MAX_SEQUENCE_LENGTH → 절단 발생.
        # 절단 후에도 (a) tier 지배(minGOLD >= maxSILVER >= maxBRONZE) 유지,
        # 하위 weight 광고가 상위 weight 광고를 역전하지 않음.
        tiers = ["GOLD", "SILVER", "BRONZE"]
        ads = [FakeAd(f"a{i}", tiers[i % 3], (i % 4) * 5000) for i in range(45)]
        weights = compute_weights(ads)
        seq = build_exposure_sequence(list(ads))
        # 절단이 실제로 일어났는지 확인(테스트 전제 방어).
        self.assertEqual(len(seq), ad_exposure.MAX_SEQUENCE_LENGTH)
        self.assertLess(len(seq), sum(weights))

        c = _counts(seq)
        wid = {ad.id: w for ad, w in zip(ads, weights, strict=True)}
        # 역전 없음: w_i > w_j 이면 count_i >= count_j.
        for i in ads:
            for j in ads:
                if wid[i.id] > wid[j.id]:
                    self.assertGreaterEqual(
                        c[i.id], c[j.id], f"inversion: {i.id}(w={wid[i.id]}) < {j.id}(w={wid[j.id]})"
                    )
        # (a) tier 밴드 총량: minGOLD >= maxSILVER >= maxBRONZE.
        by = {t: [c[a.id] for a in ads if a.exposure_tier == t] for t in tiers}
        self.assertGreaterEqual(min(by["GOLD"]), max(by["SILVER"]))
        self.assertGreaterEqual(min(by["SILVER"]), max(by["BRONZE"]))

    # ── 밴드 경계값 ──────────────────────────────────────────────────
    def test_band_boundary_max_fee_bronze_stays_below_silver(self):
        # 하위 tier(BRONZE)에 광고 여럿 + 고액 fee 로 fee_bonus 를 최대치까지 밀어올려도
        # 다음 밴드(SILVER)로 넘지 않는다(밴드 비겹침 경계 방어).
        ads = [
            FakeAd("b0", "BRONZE", 0),
            FakeAd("b1", "BRONZE", 1_000_000),
            FakeAd("b2", "BRONZE", 5_000_000),
            FakeAd("b3", "BRONZE", 50_000_000),
            FakeAd("b4", "BRONZE", 900_000_000),  # 초고액 BRONZE → fee_bonus 최대
            FakeAd("s_min", "SILVER", 0),  # 최소 fee SILVER
        ]
        w = {ad.id: wt for ad, wt in zip(ads, compute_weights(ads), strict=True)}
        max_bronze = max(w[k] for k in ("b0", "b1", "b2", "b3", "b4"))
        self.assertLess(max_bronze, w["s_min"])

    # ── 미지 tier 폴백 ───────────────────────────────────────────────
    def test_unknown_tier_falls_back_to_bronze_level(self):
        # CHECK 에 없는 tier 문자열도 크래시 없이 최하위(BRONZE 레벨)로 강등된다.
        ads = [
            FakeAd("gold", "GOLD", 0),
            FakeAd("mystery", "PLATINUM", 999_999_999),  # 미지 tier + 초고액
            FakeAd("bronze", "BRONZE", 0),
        ]
        w = {ad.id: wt for ad, wt in zip(ads, compute_weights(ads), strict=True)}
        spread = len(ads) + 1
        # 미지 tier 는 BRONZE 밴드([1, spread]) 안에 머문다 — 고액 fee 로도 상위 tier 로 못 올라감.
        self.assertLessEqual(w["mystery"], spread)
        self.assertLess(w["mystery"], w["gold"])

    # ── gcd 축소 ─────────────────────────────────────────────────────
    def test_gcd_reduction_uniform_weights_length_equals_n(self):
        # 전부 동일 weight(동일 tier·동일 fee) → gcd 축소로 각 1 → 시퀀스 길이 = N, 각 1회.
        ads = [FakeAd(f"g{i}", "GOLD", 5000) for i in range(7)]
        seq = build_exposure_sequence(list(ads))
        self.assertEqual(len(seq), len(ads))
        self.assertTrue(all(v == 1 for v in _counts(seq).values()))

    # ── 입력순서 tiebreak 결정성 ─────────────────────────────────────
    def test_equal_weight_output_follows_input_order_deterministically(self):
        # 동일 weight 광고들의 입력 순서를 바꾸면 출력도 그에 맞춰 결정적으로 바뀐다.
        a, b, c = FakeAd("a", "GOLD", 100), FakeAd("b", "GOLD", 100), FakeAd("c", "GOLD", 100)
        seq_abc = [x.id for x in build_exposure_sequence([a, b, c])]
        seq_cab = [x.id for x in build_exposure_sequence([c, a, b])]
        # 동일 weight → 입력 인덱스 순서대로 라운드로빈.
        self.assertEqual(seq_abc, ["a", "b", "c"])
        self.assertEqual(seq_cab, ["c", "a", "b"])


if __name__ == "__main__":
    unittest.main()
