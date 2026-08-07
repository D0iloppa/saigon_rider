import unittest

from app.services import routing_engine

# 실제 Valhalla 응답(HCMC, 10.7769,106.7009 -> 10.8231,106.6297)에서 발췌한 shape 문자열
# (routing_data/final_hcmc.json, W3 실증 산출물 — gitignore 대상이라 필요한 값만 픽스처로 복사)
_HCMC_SHAPE = (
    "spwpSkhoojEmEqDjBcClG}I\\c@lAcBpDzCrBbB`FbEfI|GvWrTbFdEnFpE_Bf@q@TkZpJwRbHmR~GkApAcK|KqAvAs@v@yB`Cu@x@}@~@qA"
    "xAiH|Hm@n@mTpVoVxXkDdEgRhTiEzEiE|EoHhIoKrLkAhAgFhGeWxYa[n\\yFrGiRjT}y@l_AcHzHq`@vd@kMtOgm@fp@{RnTyCpDcMtNue@"
    "di@cW|Xqb@fe@_d@vf@rZjZ`@tCbCnEpDhFdArBrA`Dj@vEaMpOk|@~aA}I`Kqq@lv@uFlGya@bd@mOtP{EjFsJfK{f@rk@wSfVyNlPub@jd@"
    "yXd[_J|JaCfCeeA~jAaCpDiFrJoe@daAkXfj@mIfPuVdf@iKdTuHvN}B`FsGlNsNfYsZhn@s[xl@}Rpa@aSx_@g@bAg@fAa@`AeDvGeb@hz@"
    "qVdh@}FzLiLvU}Ot]yXjj@_GjL{@dBmCnFeBnDgL~Te^js@GLiP|[wEdJgCpFeTjj@}DpHmDtHcKrR{EpKia@fu@uCjFuAdG}[tp@CxA_Tnd@"
    "eVzk@WdCDlBf@xClAx@hSbQxz@l{@pKxM~BhDn@jAt@bBpA~ClI`ZrAtFY|ABdBeCbB_Jf]qAz\\qD``A_Cbm@gAhYMfD_@pJc@jLI|B]rIcD"
    "|k@fCzIyGdgBoYlqH_UjeGkRdhFIrDMlEkFtyAa@~Gy@~HoAxJ_BlJ}AvHyBfJ{B~GsCjGcCjFwCrFmF|HqBfCcBnBqBdBsDdCkj@l\\}CrB_H"
    "dEw~@lj@uLtHgJfGoE~CgHvAcHzG_CxBu@r@iKfLuKtLaDtDiHlIeGhGsEbEqSrPiCzBaCbBwCjBiDnAyFrBwMjE_GvAcDx@ei@lKcIE}rAhY"
    "mRbEuR`E{bBz]_]tHua@dJ}D`AqKnCkAbE{fAdRqqBnc@_hBj_@uBd@qCj@goA~VyMpCkIfBgIfBmr@bNkJtBuUnF{VnIcMdFgNrHuBbBsEbD"
)

# 같은 응답의 첫 maneuver (type=3) 과 도로명이 있는 maneuver (type=10) 발췌
_HCMC_TRIP = {
    "legs": [
        {
            "shape": _HCMC_SHAPE,
            "maneuvers": [
                {"type": 3, "instruction": "Drive northeast.", "time": 10.454, "length": 0.058},
                {
                    "type": 10,
                    "instruction": "Turn right onto Lê Thánh Tôn/Le Thanh Ton Street.",
                    "street_names": ["Lê Thánh Tôn", "Le Thanh Ton Street"],
                    "time": 21.751,
                    "length": 0.155,
                },
                {"type": 4, "instruction": "You have arrived at your destination.", "time": 0.0, "length": 0.0},
            ],
        }
    ],
    "summary": {"time": 699.613, "length": 10.704},
    "status": 0,
}


class PolylinePrecisionTest(unittest.TestCase):
    def test_hcmc_shape_decodes_within_hcmc_bbox_at_precision6(self):
        coords = routing_engine.decode_polyline(_HCMC_SHAPE, precision=6)
        self.assertGreater(len(coords), 0)
        for lat, lng in coords:
            self.assertTrue(10.7 <= lat <= 10.9, f"lat out of HCMC range: {lat}")
            self.assertTrue(106.5 <= lng <= 106.8, f"lng out of HCMC range: {lng}")

    def test_reencoded_precision5_still_decodes_within_hcmc_bbox(self):
        reencoded = routing_engine.merge_and_reencode_shapes([_HCMC_SHAPE])
        coords = routing_engine.decode_polyline(reencoded, precision=5)
        self.assertGreater(len(coords), 0)
        for lat, lng in coords:
            self.assertTrue(10.7 <= lat <= 10.9, f"lat out of HCMC range after 5-precision decode: {lat}")
            self.assertTrue(106.5 <= lng <= 106.8, f"lng out of HCMC range after 5-precision decode: {lng}")

    def test_wrong_precision_would_have_pushed_coords_out_of_range(self):
        # 회귀 방지: precision6 shape 를 precision5 로 잘못 디코드하면 좌표가 10배 커진다는
        # ai-docs/context/routing-engine.md §4-A 의 실측 사실을 그대로 재현한다.
        wrong = routing_engine.decode_polyline(_HCMC_SHAPE, precision=5)
        lat, _lng = wrong[0]
        self.assertGreater(lat, 100)  # 10.x 가 아니라 100.x 대로 튐

    def test_merge_dedupes_shared_boundary_coordinate(self):
        coords = routing_engine.decode_polyline(_HCMC_SHAPE, precision=6)
        half = len(coords) // 2
        leg1 = routing_engine.encode_polyline(coords[: half + 1], precision=6)
        leg2 = routing_engine.encode_polyline(coords[half:], precision=6)

        merged_reencoded = routing_engine.merge_and_reencode_shapes([leg1, leg2])
        merged_coords = routing_engine.decode_polyline(merged_reencoded, precision=5)

        self.assertEqual(len(merged_coords), len(coords))


class ManeuverMappingTest(unittest.TestCase):
    def test_known_types_map_to_frontend_expected_strings(self):
        self.assertEqual(routing_engine.maneuver_string(10), "turn-right")
        self.assertEqual(routing_engine.maneuver_string(15), "turn-left")
        self.assertEqual(routing_engine.maneuver_string(26), "roundabout-enter")
        self.assertEqual(routing_engine.maneuver_string(27), "roundabout-exit")

    def test_uturn_types_contain_uturn_keyword(self):
        self.assertIn("uturn", routing_engine.maneuver_string(12))
        self.assertIn("uturn", routing_engine.maneuver_string(13))

    def test_unknown_type_falls_back_to_straight(self):
        self.assertEqual(routing_engine.maneuver_string(999), "straight")


class InstructionTemplateTest(unittest.TestCase):
    def test_vi_turn_right_with_street(self):
        text = routing_engine.render_instruction("turn-right", "Lê Thánh Tôn", "vi")
        self.assertEqual(text, "Quẹo phải vào Lê Thánh Tôn")

    def test_ko_turn_right_with_street(self):
        text = routing_engine.render_instruction("turn-right", "동탄대로", "ko")
        self.assertEqual(text, "우회전 하시고 동탄대로로 가세요.")

    def test_vi_no_street_falls_back(self):
        self.assertEqual(routing_engine.render_instruction("turn-left", None, "vi"), "Quẹo trái")

    def test_ko_no_street_falls_back(self):
        self.assertEqual(routing_engine.render_instruction("turn-left", None, "ko"), "좌회전 하세요.")


class BuildRouteOutPayloadTest(unittest.TestCase):
    def test_en_passes_through_valhalla_instruction(self):
        payload = routing_engine.build_route_out_payload(_HCMC_TRIP, "en")
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["steps"][1]["instruction"], "Turn right onto Lê Thánh Tôn/Le Thanh Ton Street.")
        self.assertEqual(payload["steps"][1]["maneuver"], "turn-right")

    def test_vi_renders_own_template_not_valhalla_english(self):
        payload = routing_engine.build_route_out_payload(_HCMC_TRIP, "vi")
        self.assertEqual(payload["steps"][1]["instruction"], "Quẹo phải vào Lê Thánh Tôn/Le Thanh Ton Street")

    def test_ko_renders_own_template_not_valhalla_english(self):
        payload = routing_engine.build_route_out_payload(_HCMC_TRIP, "ko")
        self.assertTrue(payload["steps"][1]["instruction"].startswith("우회전"))

    def test_summary_distance_and_duration(self):
        payload = routing_engine.build_route_out_payload(_HCMC_TRIP, "en")
        self.assertEqual(payload["distance_m"], 10704)
        self.assertEqual(payload["duration_s"], 700)

    def test_no_legs_returns_none(self):
        self.assertIsNone(routing_engine.build_route_out_payload({"legs": []}, "en"))


if __name__ == "__main__":
    unittest.main()
