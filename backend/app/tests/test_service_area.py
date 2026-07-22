from app.services.service_area import GEOMETRY_VERSION, geometry_contract, locate_ward_slug


def test_service_area_contract_is_versioned_and_uses_rendered_wards():
    contract = geometry_contract()

    assert contract["geometry_version"] == GEOMETRY_VERSION == "service-area.v1"
    assert len(contract["wards"]) == 37
    assert {ward["slug"] for ward in contract["wards"]} == {ward["slug"] for ward in geometry_contract()["wards"]}


def test_service_area_fixtures_cover_inside_outside_hole_and_boundary():
    cases = [
        ("inside", 10.7748, 106.6879, True),
        ("hole", 10.720666753, 106.6359233002, False),
        ("thu_duc", 10.85, 106.77, False),
        ("cu_chi", 11.0, 106.5, False),
        ("boundary", 10.741569381373877, 106.69213952845601, True),
    ]

    for _, lat, lng, expected in cases:
        assert (locate_ward_slug(lat, lng) is not None) is expected
