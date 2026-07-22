# Legacy HCMC district boundary source

MAP-12는 기존 앱 계약인 2025년 7월 이전 HCMC 22개 구·현을 유지한다. 이 데이터는 최신 법정 행정체계를 의미하지 않는다. 최신 HCMC는 168개 phường/xã/đặc khu 체계이며 전환은 별도 제품·데이터 마이그레이션 대상이다.

- 데이터: geoBoundaries `gbOpen VNM ADM2`
- 원 계보: OCHA ROAP, Government of Viet Nam
- 빌드: 2023-12-12
- 라이선스: Creative Commons Attribution 3.0 Intergovernmental Organisations (CC BY 3.0 IGO)
- 고정 커밋: `9469f09`
- 원본 SHA-256: `17db305257c1794fb5f3f4ff3c4f747a07cc5525774b8edb395d53f65219fc33`
- API 메타데이터: `https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM2/`
- 원본: `https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM2/geoBoundaries-VNM-ADM2.geojson`

생성 명령:

```bash
python3 tools/generate_legacy_district_boundaries.py database/init/138_legacy_district_boundaries.sql
```

다운로드한 원본을 재사용할 때는 두 번째 인자로 GeoJSON 경로를 전달한다. 두 방식 모두 고정 SHA-256이 다르면 생성을 중단한다.

이름 자동 매칭은 사용하지 않는다. 생성기는 원본 `shapeID`를 내부 코드에 명시적으로 연결한다. `THU_DUC`는 원본 기준 `Quan 2`, `Quan 9`, `Thu Duc`의 합집합이다.
