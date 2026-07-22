import math
import unittest
import uuid
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError

from app.database import get_db
from app.deps import verify_user_session
from app.routers import info_flood, info_gas, info_repair, info_route, info_weather
from app.services.coordinates import Latitude, Longitude


class Point(BaseModel):
    lat: Latitude
    lng: Longitude


app = FastAPI()


@app.get("/point")
async def get_point(lat: Latitude, lng: Longitude):
    return {"lat": lat, "lng": lng}


for router in (info_flood.router, info_gas.router, info_repair.router, info_route.router, info_weather.router):
    app.include_router(router)


async def authenticated_user():
    return uuid.uuid4()


async def database_session():
    yield AsyncMock()


app.dependency_overrides[verify_user_session] = authenticated_user
app.dependency_overrides[get_db] = database_session


class InfoCoordinateValidationTests(unittest.TestCase):
    def test_model_accepts_global_coordinate_boundaries(self):
        self.assertEqual(Point(lat=-90, lng=180).model_dump(), {"lat": -90.0, "lng": 180.0})

    def test_model_rejects_out_of_range_and_non_finite_coordinates(self):
        for lat, lng in [(90.001, 0), (0, -180.001), (math.nan, 0), (0, math.inf)]:
            with self.subTest(lat=lat, lng=lng), self.assertRaises(ValidationError):
                Point(lat=lat, lng=lng)

    def test_query_coordinates_use_same_validation(self):
        client = TestClient(app)

        self.assertEqual(client.get("/point", params={"lat": 10.77, "lng": 106.7}).status_code, 200)
        self.assertEqual(client.get("/point", params={"lat": 91, "lng": 106.7}).status_code, 422)
        self.assertEqual(client.get("/point", params={"lat": 10.77, "lng": 181}).status_code, 422)

    def test_info_routes_reject_invalid_coordinates_before_handler(self):
        client = TestClient(app)
        endpoints = [
            "/info/weather?lat=91&lng=106.7",
            "/info/weather/rain-radar?lat=10.7&lng=181",
            "/info/gas/nearby?lat=91&lng=106.7",
            "/info/gas/stations/nearby-v2?lat=10.7&lng=181",
            "/info/repair/nearby?lat=91&lng=106.7",
            "/info/flood/active?lat=10.7&lng=181",
            "/info/flood/map-data?lat=91&lng=106.7",
            "/info/route?origin_lat=91&origin_lng=106.7&dest_lat=10.7&dest_lng=106.8",
        ]

        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(client.get(endpoint).status_code, 422)

    def test_flood_report_accepts_valid_coordinate_outside_hcmc(self):
        report = info_flood.FloodReportCreate(lat=0, lng=0, depth_level="ankle")

        self.assertEqual((report.lat, report.lng), (0.0, 0.0))


if __name__ == "__main__":
    unittest.main()
