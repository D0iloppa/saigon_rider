import unittest
from collections import Counter
from dataclasses import dataclass

from app.services.ad_exposure import build_exposure_sequence, compute_weights


@dataclass
class FakeAd:
    id: str
    exposure_weight: int
    ad_fee: int = 1


class AdExposureTests(unittest.TestCase):
    def test_admin_weights_control_frequency(self):
        ads = [FakeAd("gold", 3), FakeAd("silver", 2), FakeAd("bronze", 1)]
        counts = Counter(ad.id for ad in build_exposure_sequence(ads))
        self.assertEqual(counts, {"gold": 3, "silver": 2, "bronze": 1})

    def test_live_policy_change_changes_existing_ad_frequency(self):
        ads = [FakeAd("a", 1), FakeAd("b", 1)]
        before = Counter(ad.id for ad in build_exposure_sequence(ads))
        ads[0].exposure_weight = 4
        after = Counter(ad.id for ad in build_exposure_sequence(ads))
        self.assertEqual(before, {"a": 1, "b": 1})
        self.assertEqual(after, {"a": 4, "b": 1})

    def test_ad_fee_is_normalized_to_minimum_one(self):
        ads = [FakeAd("a", 2, 0), FakeAd("b", 2, 1)]
        self.assertEqual(compute_weights(ads), [2, 2])

    def test_arbitrary_tiers_and_deterministic_tie_break(self):
        ads = [FakeAd("a", 1), FakeAd("b", 1), FakeAd("c", 1)]
        self.assertEqual([ad.id for ad in build_exposure_sequence(ads)], ["a", "b", "c"])
        self.assertEqual([ad.id for ad in build_exposure_sequence(ads)], ["a", "b", "c"])

    def test_empty_and_single(self):
        self.assertEqual(build_exposure_sequence([]), [])
        only = FakeAd("only", 99)
        self.assertEqual(build_exposure_sequence([only]), [only])


if __name__ == "__main__":
    unittest.main()
