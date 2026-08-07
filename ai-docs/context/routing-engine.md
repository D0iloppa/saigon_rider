# 자체호스팅 라우팅 엔진 도입 — 실증 기록 (W3)

> 배경: Google Routes API v2 (`computeRoutes`, TWO_WHEELER) 는 호출당 과금이라 대표가 제거를 지시했다. 대표 결정: 라우팅 알고리즘을 직접 구현하지 않고 Valhalla 또는 OSRM 을 docker compose 5번째 서비스로 자체호스팅한다. 프론트·`backend/app/routers/info_route.py` 는 이번 작업에서 건드리지 않았다(W4 담당).
>
> **본 문서 작성 시점 상태: 엔진 최종 선정 미결 — 대표 결정 대기.** 아래 §1 에 결정적 갈림길을 그대로 남긴다.

## 0. 실측 환경

- WSL2, `/mnt/c` (drvfs). 작업 중 여유공간 101G~186G 유지(20GB 임계 미도달, 중단 없이 진행).
- 기존 4종(정확히는 11개 컨테이너: nginx/frontend/admin_frontend/bff/engine/database/imgproxy/redis/worker/noti_worker/wiki/mcp_dev) 전부 무중단 유지 — 이번 작업에서 정지시킨 적 없음.

## 1. 엔진 선정 — 실증 결과 (결정적 갈림길, 대표 판단 필요)

### 1-A. 다국어 턴바이턴 내레이션 (vi 최우선/en 필수/ko 있으면 좋음)

**Valhalla (`valhalla/valhalla:run-latest`, v3.3.0) 실측:**

- 컨테이너 안에 `locales/` 디렉터리 자체가 존재하지 않는다(`find / -type d -iname locales` → 매치 없음, `/usr/local/share/valhalla/locales` `ls` → No such file or directory). 내레이션 문구는 **런타임 파일이 아니라 바이너리에 컴파일된 고정 리소스**다.
- `valhalla_service` 바이너리 문자열 매칭(`grep -a`)으로 실측한 컴파일된 로케일 코드 22개: `bg-BG, ca-ES, cs-CZ, de-DE, el-GR, en-GB, en-US, es-ES, fr-FR, hi-IN, it-IT, ja-JP, nb-NO, nl-NL, pt-BR, pt-PT, ru-RU, sk-SK, sl-SI, sv-SE, tr-TR, uk-UA`.
- **`vi-VN`, `ko-KR` 모두 이 목록에 없다.** 실제 `/route` 호출에서 `language: "vi-VN"` 또는 `"ko-KR"` 를 넘겨도 **에러 없이 조용히 `en-US` 로 폴백**한다(`trip.language` 응답 필드로 확인). 거리·도로명(예: "Lê Thánh Tôn", "동탄대로")은 OSM 태그 원문이라 베트남어/한국어로 나오지만, **문장 틀("Turn right onto…", "Drive northeast.")은 항상 영어**다. → 원 지시가 가정한 "Valhalla 는 내장 내레이션 보유"는 vi/ko 기준으로는 **실측상 거짓**이다.

**OSRM 실측:**

- `osrm/osrm-backend` 이미지 자체에는 텍스트 내레이션 계층이 전혀 없다(컨테이너 안에 `osrm-text-instructions` 관련 파일 없음) — OSRM 코어는 `maneuver`(type/modifier) 만 반환하고, 사람이 읽는 문장은 **별도 Node.js 패키지 `osrm-text-instructions`** 가 담당한다(공식 아키텍처상 원래 그렇다).
- 그 별도 패키지(GitHub `Project-OSRM/osrm-text-instructions`, npm 최신 0.15.0)의 `languages/translations/` 디렉터리를 실제로 조회한 결과 **31개 언어 파일 중 `vi.json` 과 `ko.json` 이 모두 존재**한다. `vi.json` 내용을 실제로 받아 확인 — 방향(북/남/동/서)·모디파이어(`trái`=left, `phải`=right, `thẳng`=straight, `ngược`=uturn) 등 실질적인 베트남어 문법 틀이 채워져 있다(placeholder 아님).

**결론(사실만, 결정 아님):** Valhalla 는 vi/ko 내레이션이 **없다**(en/de/fr 등 22개 유럽+일본어만). OSRM 은 코어에는 내레이션이 없지만 **별도 계층을 붙이면 vi+ko 실제 데이터가 존재**한다. 원 지시의 정지 조건("두 엔진 모두 vi 내레이션이 없다")과 문자 그대로 일치하진 않지만 — **한쪽(Valhalla)은 아예 없고, 다른 쪽(OSRM)은 별도 서비스를 새로 만들어야 얻을 수 있다**는 점에서 "임의 선택 금지" 조건에 해당한다고 판단해 결정을 넘긴다.

### 1-B. 오토바이(two-wheeler) 프로파일

- **Valhalla**: `costing=motorcycle`, `costing=motor_scooter` 둘 다 **추가 코드 없이 바로 동작**한다(실제 호출 확인, §3 참조). `motorcycle` 이 간선도로 통행을 더 허용해 Google `TWO_WHEELER` 의도(오토바이가 큰 길도 다님)에 더 가깝다.
- **OSRM**: 기본 프로파일이 `car.lua` / `bicycle.lua` / `foot.lua` 뿐이다(컨테이너 내 `/usr/local/share/osrm/profiles/` 실측 — motorcycle 프로파일 없음). 오토바이 특성(차선 이용, 일부 진입 제한 다름)을 반영하려면 **`car.lua` 를 베이스로 커스텀 lua 를 새로 작성**해야 한다(원 지시에서도 이미 이렇게 예상했음 — 새로운 사실 아님).

### 1-C. 종합

| 항목 | Valhalla | OSRM |
|---|---|---|
| vi 내레이션 | 없음(실측) | 별도 계층(`osrm-text-instructions`)에 데이터 있음, 서비스 신규 구축 필요 |
| ko 내레이션 | 없음(실측) | 별도 계층에 데이터 있음, 서비스 신규 구축 필요 |
| en 내레이션 | 있음(en-US, en-GB) | 별도 계층에 있음(`en.json`) |
| 오토바이 프로파일 | `motorcycle`/`motor_scooter` 내장, 즉시 사용 가능 | 없음, `car.lua` 커스텀 필요(기존 예상대로) |
| 컨테이너 구성 | 1개(라우팅 엔진 단독) | 최소 2개(osrm-backend + text-instructions 래퍼 서비스) 필요 |
| 다중 리전 병합 | 실증됨 — 아래 §2 | 미실증(범위 밖) |

**대표 결정이 필요한 지점:** vi 내레이션을 엔진 자체 내장으로 확보하려면(Valhalla) 커스텀 로케일 데이터를 직접 작성해 Valhalla 를 **소스에서 재빌드**해야 하고(공식 배포 이미지엔 없음 — 런타임 파일 주입 방식이 아니라 컴파일 타임 리소스), OSRM 으로 가면 별도 Node 서비스를 새로 세우되 vi/ko 번역 데이터는 이미 있다. 아래 두 옵션 중 하나를 결정해달라(§5 폴백 선택지와 연결):

- **옵션 A (Valhalla 유지)**: 오토바이 프로파일은 즉시 확보. vi/ko 내레이션은 당장 없음 → BFF 가 `maneuver type` 코드를 받아 **BFF 자체 vi/ko 문구 템플릿**(OSRM 의 `vi.json`/`ko.json` 구조를 참고해 우리가 직접 작성)으로 렌더링. 엔진은 "경로계산+maneuver 코드"만, "문장 생성"은 BFF 책임으로 이전.
- **옵션 B (OSRM + 별도 text-instructions 서비스)**: vi/ko 문구 데이터는 기존 라이브러리 재사용 가능. 대신 오토바이 프로파일 커스텀 lua 작성 + 6번째 컨테이너(Node 래퍼) 필요 — 인프라·개발 범위가 늘어남.
- **옵션 C (Valhalla 소스 재빌드로 vi/ko 로케일 직접 추가)**: 표준 이미지 대신 커스텀 이미지 빌드 파이프라인이 새로 필요(CI 부담 증가). 미검토(범위 밖, 시간상 실측 안 함).

## 2. 데이터 수집 — 실측치

| 항목 | 실측 바이트 | 비고 |
|---|---|---|
| `vietnam-latest.osm.pbf` (원본, 다운로드 후 삭제됨) | 326,144,865 B (311 MiB) | Geofabrik `asia/vietnam-latest.osm.pbf` |
| HCMC bbox 추출 (`osmium extract -b 106.2,10.3,107.2,11.3`) | 33,012,578 B (31.5 MiB) | bbox 는 `backend/scripts/ward_import.py:32` 의 `HCMC_BBOX="10.3,106.2,11.3,107.2"` 재사용 |
| `south-korea-latest.osm.pbf` (원본, 다운로드 후 삭제됨) | 284,816,135 B (271.6 MiB) | Geofabrik `asia/south-korea-latest.osm.pbf` |
| 경기도 bbox 추출 (`osmium extract -b 126.5,36.9,127.9,38.3`) | 90,449,216 B (86.3 MiB) | **행정경계가 아니라 직사각형** — 서울 전역·인천 일부 포함. 동탄역(37.2011,127.0980) 포함 확인 |

**한국 범위를 전국이 아니라 경기도 bbox 로 축소한 결정의 근거 — 실측이 아니라 외삽:** HCMC 31.5MB pbf → Valhalla 타일 129MB, 빌드 10m25s 라는 실측 비율(약 3.9배 팽창, MB당 ~20초)을 그대로 전국 pbf(271.6MB)에 곱하면 타일 ~1.1GB, 빌드 ~90분으로 추정된다는 뜻이며, **전국 pbf 를 실제로 빌드해서 90분/1.1GB 를 직접 측정한 것이 아니다.** 이 추정에 근거해 30분 임계를 넘길 것으로 판단하고 경기도 bbox 로 축소했다. 대표 승인 확인됨("지금은 경기도면 충분하다").

`south-korea-latest.osm.pbf`(271.6MB) 는 경기도 추출 완료 후 삭제했다. 빌드 스크립트는 최종 bbox 추출 파일(`gyeonggi.osm.pbf`)이 이미 있으면 국가 pbf 다운로드/추출 단계를 건너뛰도록(멱등) 작성했으므로, 이후 재실행에서 삭제된 원본이 문제되지 않는다 — 다만 **경기도 bbox 를 바꾸거나 데이터를 최신화하려면 국가 pbf 를 다시 받아야 한다**(그 경우에도 스크립트가 자동으로 다시 다운로드한다).

## 3. Valhalla 실측 — 빌드/서빙

### 3-A. 단일 리전(HCMC) 빌드 (참고용, 최종 구성에서는 병합 빌드로 대체됨)

- 빌드 시간: 10m25s. 결과 노드 660,935 / directed edge 1,555,154. 최종 타일 129 MiB.

### 3-B. 병합 리전(HCMC + 경기도) 빌드 — 최종 구성

- `valhalla_build_tiles` **한 번의 호출에 두 pbf 를 함께 인자로 전달**(`hcmc.osm.pbf gyeonggi.osm.pbf`) — 로그에 `Parsing files for ways: hcmc.osm.pbf, gyeonggi.osm.pbf` 로 실제 동시 처리됨을 확인. **하나의 컨테이너/하나의 타일셋으로 두 리전을 서빙할 수 있다는 것을 실증했다.**
- 빌드 시간: 00:55:01 ~ 01:19:17 = **24분 16초** (참고: 감독 중간보고의 "약 26분"은 근사치이며 본 문서 수치가 로그 원문 기준 실측치다).
- 결과: Node Count 1,531,857 / **Directed Edge Count 3,909,884** / EdgeInfo Count 1,963,498 (참고: 감독 중간보고의 "1,954,942 edges" 는 이 로그 라인과 다르며, 본 문서는 `valhalla_build_tiles` 로그에 실제로 출력된 `Directed Edge Count` 값을 그대로 인용했다).
- 빌드 중 경고 `Local index N exceeds max value of 7, returning heading of 0` — 로그에서 **95건** 실측(참고: 감독 중간보고의 "119건+" 와 다르며 본 수치가 `grep -c` 로 직접 카운트한 값). 대형 교차로에서 진입 edge 개수가 8개(0~7)를 넘을 때 heading 계산을 생략하고 0으로 처리하는 내부 경고로 보인다. **실제 안내 문구 품질 영향 판정**: HCMC/동탄 두 실증 경로의 maneuver 문구를 전부 육안 확인한 결과 끊기거나 깨진 문구는 없었다(로터리·교차로 구간 포함) — 이 경고가 두 실증 경로 상에서는 **가시적 품질 저하로 이어지지 않았다.** 다만 경고가 발생한 정확한 좌표를 이번 실증 경로가 지나갔는지는 별도 대조하지 않았으므로 "전 지역에서 영향 없음"이 아니라 "실증한 두 경로에서는 영향 없음"으로 한정해 보고한다.
- **최종 정리 후 타일 총량: 326 MiB** (중간 산출물 정리 전 한때 최대 1.4GB 까지 쌓였다가 `Cleaning up temporary *.bin files` 단계에서 정리됨 — 2GB 임계 통과).
- 최종 구성: `routing_data/valhalla/tiles/`(326MiB, 병합 타일) + `routing_data/valhalla/valhalla.json`(단일 config) 하나로 통합. 과거 단일 리전 빌드 산출물(`tiles_combined/` 이름의 중간 디렉터리, `valhalla_combined.json`)은 정리 후 이 최종 이름으로 교체했다 — 이중 구성 없음.
- **서빙 리소스 특성**: 빌드(그래프 정렬·shortcut 생성 등)는 무겁다(716만 노드 정렬 등 CPU/메모리 집약, 24분 소요). 반면 `valhalla_service` 로 서빙하는 동작 자체는 빌드된 타일을 mmap 으로 읽는 가벼운 프로세스다. **운영 방식 제안: 타일 빌드는 개발/빌드 머신에서 수행하고, 완성된 `tiles/` 디렉터리만 운영 서버로 옮겨 서빙 컨테이너를 띄운다. 운영 서버에서 매번 재빌드하지 않는다.**

### 3-C. 실증 curl — 동일 컨테이너에서 두 리전 응답

컨테이너 하나(`valhalla_service /data/valhalla/valhalla.json 1`, 포트 8002, 이번 검증에서만 로컬 18002 로 임시 매핑 — 최종 compose 구성에서는 내부 네트워크 전용)로 두 요청을 순서대로 보냈다.

**호치민 (vi-VN 요청 → en-US 로 폴백, 도로명만 베트남어):**
```json
// POST /route {"locations":[{"lat":10.7769,"lon":106.7009},{"lat":10.8231,"lon":106.6297}],"costing":"motorcycle","language":"vi-VN"}
// 응답 trip.language: "en-US"  ← 요청한 vi-VN 이 무시되고 조용히 폴백됨
"summary": {"time": 699.613, "length": 10.704}
maneuvers:
  type=3  | "Drive northeast."
  type=10 | "Turn right onto Lê Thánh Tôn/Le Thanh Ton Street."
  type=15 | "Turn left onto Võ Thị Sáu/Vo Thi Sau Street."
  type=26 | "Enter Vòng xoay Lăng Cha Cả/Lang Cha Ca Roundabout and take the 2nd exit onto Cộng Hòa/Cong Hoa St."
  type=4  | "You have arrived at your destination."
```

**동탄역 (같은 컨테이너, ko-KR 요청 → en-US 로 폴백, 도로명만 한국어):**
```json
// POST /route {"locations":[{"lat":37.2011,"lon":127.0980},{"lat":37.1950,"lon":127.1120}],"costing":"motorcycle","language":"ko-KR"}
// 응답 trip.language: "en-US"
"summary": {"time": 211.172, "length": 2.255}
maneuvers:
  type=2  | "Drive east."
  type=10 | "Turn right onto 동탄대로/Dongtan-daero."
  type=19 | "Turn left to take the ramp."
  type=9  | "Bear right to stay on 동탄청계로/Dongtancheonggye-ro."
  type=6  | "Your destination is on the left."
```

같은 `docker ps` 컨테이너 ID(`saigon_routing_final`)에서 두 응답 모두 200 OK 로 나왔다 — **하나의 병합 타일셋/하나의 컨테이너로 호치민·동탄 두 지역을 동시에 서빙 가능함을 실증**했다.

> **주의**: 위 두 응답 모두 "도로를 따라가는 경로 polyline 과 실제 안내 문구"는 나오지만, **베트남어/한국어 "문장"은 아니다**(§1-A 참조). 원 지시의 검증 목표("실제 베트남어 턴바이턴 문구가 돌아온다")는 Valhalla 단독으로는 **아직 충족되지 않는다** — §1-C 결정에 따라 BFF 자체 템플릿(옵션 A) 또는 OSRM+별도서비스(옵션 B)가 필요하다.

### 3-D. costing 프로파일 결정

`motorcycle` vs `motor_scooter` 실제 호출 비교(동일 HCMC 출발/도착):

| costing | time(s) | length(km) | cost | 특징 |
|---|---|---|---|---|
| `motorcycle` | 699.6 | 10.704 | 1933.6 | 간선/고속도로형 도로 허용 — 더 직선적 |
| `motor_scooter` | 937.4 | 10.875 | 3058.3 | 제한접근 도로 회피 — 더 보수적, 시간 33% 더 걸림 |

**결정: `motorcycle` 을 사용한다.** 베트남 오토바이는 실제로 간선도로를 함께 쓰는 경우가 많고, Google `TWO_WHEELER` 의 실제 주행 패턴(고속도로 회피는 하되 일반 간선은 허용)에 `motorcycle` 이 더 근접하다.

## 4. 응답계약 갭 분석 (구현은 W4, 여기는 사실 확정)

### 4-A. polyline precision — 실측 확정, 불일치 있음

- Valhalla 응답 `trip.legs[].shape` 는 **precision 6 (1e6)** 로 인코딩된다(실측: 동일 encoded string 을 precision6/precision5 로 각각 디코드해 좌표가 실제 HCMC 범위(위도 10.7~10.8, 경도 106.6~106.7)에 맞는지 대조 — precision6 만 맞았고 precision5 로 디코드하면 좌표가 10배 커져(`107.76, 1067.00` 등) 지도 밖으로 완전히 벗어난다).
- 프론트 `frontend/src/lib/polyline.ts:32` 는 **precision 5 (1e5)** 로 고정 디코드한다(수정 금지 대상 — 건드리지 않았다).
- **BFF 가 해야 할 변환**: Valhalla 응답의 `shape` 를 precision 6 으로 디코드해 `[lat, lng]` 부동소수 좌표 리스트로 변환한 뒤, **Google 스타일 precision 5 인코더로 재인코딩**해서 `RouteOut.polyline` 에 담아야 한다. (인코딩 자체는 표준 폴리라인 알고리즘이라 새 라이브러리 불필요 — 좌표를 1e5 로 반올림해서 델타 인코딩하면 된다.) 이 변환을 생략하면 지도에 경로가 10배 어긋나게 그려진다.

### 4-B. maneuver 매핑표

Valhalla `maneuvers[].type` 는 **정수 코드**다(문자열 아님). 반면 프론트 `RideNav.tsx:74-83` 의 `ManeuverIcon` 은 `maneuver` 를 **소문자 하이픈 문자열**로 가정하고 `.includes('left')`/`'right'`/`'uturn'`/`'roundabout'` 로 대소문자 구분(case-sensitive) substring 매칭을 한다. **두 실증 경로에서 실제로 관측된 type 값**:

| Valhalla type | 관측된 instruction 예 | 의미(Valhalla 공식 enum 명) | 프론트 매칭을 통과시키려면 BFF 가 내려야 할 문자열 |
|---|---|---|---|
| 2 | "Drive east." | kStartRight(방위 출발) | `straight` (또는 별도 출발 아이콘 케이스 추가) |
| 3 | "Drive northeast." | kStart(방위 출발) | `straight` |
| 4 | "You have arrived at your destination." | kDestination | (isLast 로 별도 처리되므로 무관) |
| 6 | "Your destination is on the left." | kDestinationLeft | `destination-left` (isLast 우선 처리) |
| 9 | "Bear right onto…" | kSlightRight | `turn-slight-right` |
| 10 | "Turn right onto…" | kRight | `turn-right` |
| 15 | "Turn left onto…" | kLeft | `turn-left` |
| 16 | "Bear left toward…" | kSlightLeft | `turn-slight-left` |
| 19 | "Turn left to take the ramp." | kRampLeft | `ramp-left` |
| 23 | "Keep right to stay on…" | kStayRight | `stay-right` |
| 24 | "Keep left to stay on…" | kStayLeft | `stay-left` |
| 26 | "Enter … Roundabout and take the 2nd exit…" | kRoundaboutEnter | `roundabout-enter` |
| 27 | "Exit the roundabout onto…" | kRoundaboutExit | `roundabout-exit` |

(U턴 type 12/13 은 이번 두 실증 경로에 나타나지 않아 **미관측** — Valhalla 공식 enum 상 존재는 하지만 실제 응답으로 확인하지 못했다.)

**판정: 그대로 통하지 않는다.** 정수 → 소문자-하이픈 문자열 변환이 BFF `_to_route_out` 상당 위치에서 반드시 필요하다(프론트는 수정 금지 대상이므로 변환 책임은 BFF).

## 5. OSM ODbL 표기 의무

OpenStreetMap 데이터를 사용하는 모든 화면에는 **"© OpenStreetMap contributors"** 표기가 필요하다(ODbL 라이선스 조건). Valhalla/OSRM 자체호스팅 라우팅을 앱에 노출하는 시점부터 이 표기가 앱 어딘가(지도/경로 화면 하단 등)에 들어가야 한다. **실제 표기 삽입은 이번 작업 범위 밖 — 별건으로 남긴다.**

## 6. 범위 밖 — 참고만

`scripts/gen_saigon_map_v2.py`(L2/L3 지도 생성기)는 현재 Overpass 공개 API 를 쓰고 있어 향후 로컬 pbf(`routing_data/osm/*.pbf`)로 전환할 여지가 있다 — 대표가 별건으로 관리 중이므로 이번 작업에서는 건드리지 않았다.

## 7. 미확인·미처리 항목 (정직하게 남김)

- **엔진 최종 선정 미결** — §1-C 옵션 A/B/C 중 대표 결정 필요. 이 문서의 §3(compose 서비스 정의)·`.env`/`.env.example` 키 추가는 **결정 이후로 보류**했다(엔진마다 서비스명·응답 스키마가 달라 미리 확정하면 되돌리는 비용이 큼).
- 전국(베트남/한국) 단위 실제 빌드는 실행하지 않았다(§2 의 외삽 판단으로 대체) — 실측 아님을 재차 명시.
- Valhalla `motorcycle` 프로파일이 실제 오토바이 통행 제한(일부 도로 오토바이 금지 등)을 얼마나 정확히 반영하는지는 OSM 태그 품질에 의존하며, 이번 작업에서 태그 정확도까지 검증하지 않았다.
- U턴(type 12/13), 페리, 환승 등 두 실증 경로에 나타나지 않은 maneuver type 은 §4-B 매핑표에서 미관측으로 남겼다 — Valhalla 공식 문서 기준 enum 명만 부기했고 실제 응답으로 재현하지 않았다.
- `Local index N exceeds max value of 7` 경고의 실제 발생 좌표와 실증 경로의 정확한 지리적 겹침 여부는 대조하지 않았다(§3-B 참조 — "두 실증 경로에서는 영향 없음"으로 한정).
- OSRM 의 다중 리전 병합 서빙(§3-B 의 Valhalla 실증과 대응하는 실험)은 실행하지 않았다(엔진 미결 상태에서 두 엔진 모두 완전 검증하는 것은 범위/시간상 비효율적이라 판단해 보류).
- docker compose 서비스 등록·`.env`/`.env.example` 키·재현 가능한 빌드 스크립트(§4 원 지시)는 **엔진 결정 후 즉시 이어서 작업 가능한 상태**로 준비돼 있으나(§2/§3 의 다운로드·추출·빌드 커맨드가 이미 검증된 시퀀스), 아직 스크립트 파일로 작성하지 않았다.
