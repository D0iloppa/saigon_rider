# SVG 지도 회전(나침반) 지원 설계 결정

> 작성: 2026-08-06 · **개정 2026-08-06 (2차)** · 대상: `frontend/src/components/maps/SaigonMapV5.tsx`(1,595줄)
> 배경: 대표 지시 2026-08-06 18:47 "마켓 동네지도로 적용해"(카메라 추적 + 나침반)
> 상태: **완료 — §7 step 1~10 전부 구현·커밋됨(2026-08-06).** 롤백 기준점 `e9c072f`. 알려진 갭 2건은 §10 참조.
> **개정 이력 (2026-08-06, 3차)**: D-D 의 3-state 순환(자유/추종/추종+나침반)을 **직교 2축**(추종 on/off, 나침반 on/off — 독립 토글, "자유+나침반" 조합 가능)으로 교체하고, 서비스 지역 밖에서도 회전(나침반)은 허용하도록 변경. 근거: 사용자 결정 2026-08-06.
> 관련: [`context/service-rules.md`](context/service-rules.md) · [`260806_proximity_ad_design.md`](260806_proximity_ad_design.md)
>
> **파일명 주의**: 파일명에 `v6` 가 남아 있으나 **신규 컴포넌트 V6 는 만들지 않는다**(D-H). 파일명은
> [`INDEX.md:30`](INDEX.md) 링크가 걸려 있어 그대로 두고, 제목·본문 표현만 정정했다.

---

## 0. 결론 요약

> **개정(2차)**: D-A 를 위험 서술로 축소하고 **회전 계층 결정을 D-G 로 단일화**했다(원안 §2·§3 이 서로 다른 두 계층을 동시에 서술해 이중 회전 위험이 있었다). D-E 의 전제(`useLocationStore` 가 heading 을 준다)가 사실과 달라 정정. D-H·D-I 신설.

| # | 결정 | 근거 |
|---|---|---|
| **D-G** | **회전 계층은 하나 — SVG 내부 `<g transform="rotate(-θ, camCx, camCy)">`.** CSS `transform: rotate()` 안은 **폐기**. | §2·§3 — 루트 `<svg>` 가 회전하지 않아 `getBoundingClientRect()` 가 정확하고, 리스너 이설이 0 이며, D-B 가 성립한다 |
| **D-A** *(정정)* | `getBoundingClientRect()` 부풀림은 **CSS-transform 안에만** 해당하는 위험이다. D-G 에서는 발생하지 않는다. 대신 **루트 `preserveAspectRatio="none"` 불변식**(`vb.h == vb.w × 컨테이너 비율`)을 지켜야 한다 | §2 |
| **D-B** | 라벨·마커는 counter-rotate 하지 않고 **위치만 회전** | 접점 최소화 + 글자 절대 기울지 않음 — §3 |
| **D-C** | 나침반 모드에서 **L3(건물) 비활성, L2 고정** | 오버스캔 √2 → 면적 2배 — §4 |
| **D-D** | 상시 follow 금지. **3-state 토글**(자유/추종/추종+나침반) | `service-rules:93` "탐색과 안내는 분리한다" — §5 |
| **D-E** *(정정)* | 워처를 **새로 만들지 않는다** — 단, `useLocationStore` 가 아니라 **`SaigonMapV5` 가 이미 걸고 있는 meDot 워처**(`:849`)의 콜백을 재사용한다 | `useLocationStore` 는 heading/speed 필드가 없고 30 m 게이트가 걸려 있다 — §6·§9 |
| **D-F** | follow 는 `focusLatLng` 를 쓰지 않는다 + 기존 버그 선행 수정 | §6 |
| **D-H** *(신설)* | **V6 컴포넌트를 신설하지 않는다.** `SaigonMapV5` 에 회전을 **prop 으로 추가**하고, prop 미전달 시 기존 동작과 완전히 동일하다(기본 off 킬스위치) | 이미 방치된 렌더러가 2벌 있다 + V5 소비처가 8곳 — §8 |
| **D-I** *(신설)* | heading 소스는 **GPS course-over-ground 단일**. `speed < 1.5 m/s` 또는 `heading == null` 이면 **마지막 유효 방위 유지**(회전 정지). 데드존 8°. DeviceOrientation **미도입** | 이 화면들엔 경로가 없어 1순위(세그먼트 방위)가 존재하지 않는다 — §9 |

**회전은 "불가"가 아니라 "설계 작업"이다.** 다만 §2 의 좌표계 전제를 모르고 착수하면 조용히 틀어진다.

---

## 1. 회전 사양은 새로 설계하지 않는다 — 이미 있다

`MapCanvas`(maplibre) 기반 `RideNav` 에 **나침반 모드가 이미 완성돼 있고**, 그 사양이 `service-rules.md` 에 기록돼 있다:

- `:96` 도착 판정은 **나침반 모드보다 먼저** 평가한다 (나침반 분기 early return 에 막히면 도착이 영영 안 잡힌다)
- `:98` 카메라 명령은 서로 취소된다 — ①개요 `fitBounds` 는 안내 중 건너뛴다 ②시작 `flyTo` 가 끝날 때까지 `follow` 를 막는다 ③`follow` 는 center 와 bearing 을 **한 번의 `easeTo`** 로 준다
- `MapCanvas.tsx:108` `map.flyTo({ center, zoom, bearing: brg, ... })` — 진행방향 회전 동작 구현체

**이 작업은 UX 를 새로 설계하는 게 아니라, 검증된 이 사양을 SVG 렌더러로 이식하는 것이다.** 동작 기준은 RideNav 나침반 모드로 삼는다. (특히 `:98` ③ "center+bearing 을 한 번에" 는 SVG 에서도 그대로 지켜야 한다 — viewBox 와 회전각을 별개 프레임에 갱신하면 흔들린다.)

---

## 2. D-G / D-A — 회전 계층을 하나로 확정한다

> **개정(2차)**: 원안은 §2(CSS transform 계층)와 §3(SVG `<g transform>`)을 **동시에** 서술했다. 둘을 다 적용하면 이중 회전이다. 아래에서 하나를 채택하고, 원안 §2 가 "제일 중요한 함정"이라 지목한 위험의 **적용 범위를 한정**했다.

### 2.1 현재 코드의 실제 위치 (원안의 줄번호 정정)

제스처 수학이 **수동 픽셀 변환**이고, 그 측정 대상과 리스너가 **루트 `<svg>` 그 자체**다 — 외곽 div(`containerRef`)에 붙어 있지 않다.

```jsx
// :1198  containerRef — 측정에 거의 안 쓰인다(초기 비율 산출 :545 뿐)
<div ref={containerRef} className={styles.stage} style={{ height }}>
  <svg ref={svgRef} viewBox={…} preserveAspectRatio="none"
       onPointerDown={…} onPointerMove={…} onPointerUp={…} onPointerCancel={…}>   // :1199-1207
```

| 위치 | 코드 | 회전 시 영향 |
|---|---|---|
| `:916-918` | 휠 줌 — `el.getBoundingClientRect()` (`el = svgRef.current`, 비-passive 리스너도 svg 에 직접 등록 `:912`) | rect 부풀림 대상 |
| `:951` + `:965-966` | 팬·핀치 — `e.currentTarget.getBoundingClientRect()` (`currentTarget` = `<svg>`) | rect 부풀림 대상 |
| `:1000` | 탭 → ward/pick 좌표 — `svgRef.current.getBoundingClientRect()` | rect 부풀림 대상 |
| `:449-451` | `updateAnchorOverlay()` — `svg.clientWidth/clientHeight` 로 px 환산 | `clientWidth` 는 CSS transform 에 영향받지 않음(레이아웃 값) |

**`getBoundingClientRect()` 는 CSS transform 이 적용된 요소에 대해 "회전된 결과의 축정렬 바운딩박스"를 반환한다** → `r.width/r.height` 가 각도에 따라 부풀어(45° 에서 최대 √2배) 탭·팬이 조용히 틀어진다. 에러가 아니라 오차라서 테스트로 안 잡히고 "손가락과 지도가 안 맞는다"로만 나타난다.

**단, 이 위험은 CSS-transform 안에만 존재한다.** SVG 내부 `<g transform>` 안에서는 루트 `<svg>` 요소에 CSS transform 이 없으므로 레이아웃 박스가 축정렬로 유지되고 위 4곳 전부가 각도와 무관하게 정확하다. (감독 가설 **확인됨** — 위 표의 요소가 모두 `<svg>` 이고, `<g>` 회전은 `<svg>` 의 박스에 영향을 주지 않는다.)

### 2.2 두 안 비교

| 판정 항목 | 안 ① CSS `transform: rotate()` 계층 | 안 ② SVG `<g transform="rotate()">` — **채택(D-G)** |
|---|---|---|
| **1. `getBoundingClientRect()` 정확성** | ❌ 위험 실재. 회피하려면 회전 계층을 svg **바깥**에 두고, 리스너 4개·비-passive 휠 등록(`:912`)·`setPointerCapture`·`data-marker` 히트테스트(`:993`)·`touch-action:none`(CSS `.svg`)을 **새 외곽 div 로 전부 이설**해야 한다. 원안이 적은 "헬퍼 1개 + 호출부 2곳"보다 훨씬 큰 수술이다 | ✅ 위험 없음. DOM·리스너 이설 **0** |
| **2. 제스처 역회전(`rotateVec`)** | 필요 | **필요 — 동일.** 화면 픽셀 델타를 회전된 지도 좌표로 되돌리는 일은 회전을 어느 계층에 걸든 남는다(감독 판단 **확인됨**). 두 안의 차이가 아니다 |
| **3. 라벨·마커** | ❌ 서브트리가 통째로 돈다 → 라벨·마커·배지 전부에 `rotate(+θ)` counter-rotate 필요. **D-B("위치만 회전") 성립 불가** | ✅ 지형만 `<g>` 안, 라벨·마커는 밖 → D-B 그대로 성립 |
| **4. nested `<svg preserveAspectRatio="none">`** (ward depth2/depth3) | ✅ 안전(렌더 결과 픽셀을 돌린다) | ✅ 안전. 변환 합성이 `R∘S`(안쪽 비균등 스케일이 먼저, 강체 회전이 나중)라 왜곡이 생기지 않는다 — 원안 §3 의 주장 **확인됨**. 단 2.3 의 전제가 붙는다 |
| **5. GPU 합성·성능** | CSS transform 은 합성 레이어 승격 가능 — **측정 안 함(추측)** | `<g transform>` 은 서브트리 리페인트 — **측정 안 함(추측)**. 아래 반론 참조 |

**5번에 대한 추측 아닌 논거 하나**: 나침반 모드는 `service-rules:98`③ 규칙상 **center(viewBox)와 bearing 을 같은 프레임에 함께** 갱신한다. viewBox 가 매 프레임 바뀌면 그 레이어의 **내용 자체가 매 프레임 무효화**되므로 "내용 고정 + 변환만 변화"라는 합성 레이어의 이점이 성립하지 않는다. 즉 안 ①의 GPU 이점은 이 사용 패턴에서 대부분 소멸한다. 저사양 Android 대비의 실질 지렛대는 계층 선택이 아니라 **D-C(L3 비활성 + 컬링 사각형)** 다.

### 2.3 채택안의 전제 — 루트 `preserveAspectRatio="none"` 불변식 (D-A 정정분)

루트 `<svg>` 는 `preserveAspectRatio="none"`(`:1203`)이라 SVG→화면 매핑 `P` 가 **비균등일 수 있다**. 안 ②의 합성은 `P∘R` 이므로 — **`P` 가 비균등이면 회전이 전단(shear)으로 보인다.**

현재 코드는 모든 카메라 경로에서 `vb.h = vb.w × (clientHeight/clientWidth)` 를 유지하므로 `P` 는 균등이다: `applyZoom:521-533`, `focusLatLng:716-725`, `zoomInRef:874-882`, 초기화·복원 `:541-560`. **그러나 `ResizeObserver` 가 없다**(전체 파일 0건) — 컨테이너 비율이 바뀌면(화면 회전, 시트 레이아웃 변화) `vb` 비율이 낡아 `P` 가 비균등해진다. 지금은 `preserveAspectRatio="none"` 이라 그냥 늘어나 보이는 것으로 끝나지만(현행 동작), 회전을 켜면 전단으로 드러난다.

→ **나침반 모드 진입 시점과 컨테이너 리사이즈 시 `vb.h` 를 `vb.w × ar` 로 재계산한다.** (이것이 안 ②의 유일한 실질 추가 비용이다 — 안 ①은 픽셀을 돌리므로 이 전제가 필요 없다.)

### 2.4 좌표계 이방성 — 보정하지 않는다

좌표계는 `cos(lat)` 보정이 없는 plate carrée 다(`BASE_H = BASE_W × dLat/dLng`, `:50-53`). 따라서 x/y 의 "유닛당 지상거리"가 `cos(10.8°) ≈ 0.982` 만큼 다르다. 방위 β 를 그대로 `rotate(-β)` 에 넣을 때의 화면 각 오차는 β=45° 에서 최대 **약 0.5°** — D-I 의 데드존 8° 안이다. **보정하지 않는다**(보정을 넣으면 지형 회전과 라벨 위치 회전이 서로 다른 각을 쓰게 돼 오히려 갈라진다).

### 2.5 제스처 역회전 헬퍼 (두 안 공통, 채택안에도 그대로 필요)

```ts
// 화면 좌표계 델타를 지도 좌표계로 되돌린다
const rotateVec = (dx: number, dy: number, deg: number) => {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
};
// 팬(:965):   const d = rotateVec(dxRaw, dyRaw, bearing)
// 탭(:1000)·휠(:916)·핀치 중심(:955): 회전중심 기준으로 point 를 +bearing 회전한 뒤 viewBox 매핑
```

호출부는 **4곳**이다(원안은 2곳이라 적었다): `:916` 휠, `:955` 핀치 중심, `:965` 팬, `:1000` 탭. `bearing === 0` 이면 항등이므로 킬스위치 off 경로의 동작은 바뀌지 않는다.

> 참고: 히트테스트를 DOM 이벤트(요소 `onClick`)로만 했다면 브라우저가 역변환을 대신 해줘 비용이 0 이었다. 수동 픽셀 수학을 쓰기 때문에 생기는 비용이다. 히트테스트를 요소 이벤트로 옮기는 리팩터링은 이번 범위에 넣지 않는다.

---

## 3. D-B — 라벨은 counter-rotate 하지 않는다

> **개정(2차)**: 이 절의 코드블록이 **D-G 로 채택된 유일한 회전 계층**이다(§2 의 CSS 계층은 폐기). 아래 3.3 에 실제 수정 지점을 열거했다.

### 채택안: 지형만 회전, 라벨·마커는 위치만 회전

```jsx
<svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
  {/* 지형 — 회전 그룹 */}
  <g transform={`rotate(${-bearing} ${camCx} ${camCy})`}>
    {L1}{L2}{L3}
  </g>

  {/* 라벨·마커 — 회전 그룹 밖. glyph 는 절대 기울지 않는다 */}
  <g>
    {badges.map(b => {
      const p = rotatePoint(b.x, b.y, camCx, camCy, -bearing);
      return <g transform={`translate(${p.x}, ${p.y})`}>…</g>;
    })}
  </g>
</svg>
```

### 근거

- **접점이 적다.** 라벨 6곳 이상에 `rotate(+bearing)` 을 개별로 거는 대신, 위치 계산 경로 한 곳에 `rotatePoint()` 를 끼운다.
- **`labelDeclutter.ts`(175줄)가 이미 라벨 위치를 JS 에서 계산한다.** 위치 계산 경로가 이미 존재하므로 새 구조를 만들지 않는다.
- **글자 기울기 사고가 원천 차단된다.** counter-rotate 방식은 한 곳만 누락되면 그 라벨만 뒤집히고, 회전 중에만 드러나서 발견이 늦다.
- 라벨 겹침 판정(declutter)도 회전 후 좌표로 해야 정확하다 — 위치를 먼저 회전시키는 이 방식과 자연히 맞는다.

### 주의

- `rotatePoint` 의 회전 중심은 **카메라 중심(=사용자 위치, 나침반 모드)** 이고 viewBox 중심이 아니다. 둘을 혼용하면 회전할 때 지도가 미끄러진다. **지형 `<g>` 의 `rotate(-θ, camCx, camCy)` 와 반드시 같은 중심**을 쓴다.
- nested `<svg preserveAspectRatio="none">`(ward depth2/depth3)는 회전 그룹 안에 들어가도 안전하다 — 비균등 스케일이 지도 좌표계에서 먼저 적용되고 그 결과가 강체 회전되므로 왜곡이 생기지 않는다. (§2.2 4번 확인)

### 3.3 실제 수정 지점 (개정 2차 — 신규)

지형 `<g>` **안**에 들어갈 것: 배경 `rect`(`:1219`) · 도시 윤곽(`:1223-1229`) · Layer 1 nested svg(`:1233-1258`) · Layer 2(`:1261-1277`) · Layer 3 `renderL3Layer()`(`:1280`) · 선택 동 테두리(`:1283-1296`).

`<g>` **밖**에 남고 좌표만 회전할 것 — `lx()/ly()` 호출 지점이 전부다:

| 줄 | 대상 |
|---|---|
| `:1306` | 동 이름 라벨 |
| `:1328` | 선택 동 라벨(오렌지) |
| `:1345` | 집계/클러스터 배지 |
| `:1369` | 마커(업체 핀·dot) — 라벨·글리프·그림자 전부 이 `mx/my` 파생 |
| `:1526` | 내 위치 점 |
| `:447-451` | `updateAnchorOverlay()` — px 환산 결과를 컨테이너 중심 기준으로 회전(HTML 형제 노드라 `<g>` 밖) |

권고 구현 형태: `lx/ly` 를 직접 부르는 대신 **회전 적용 좌표 헬퍼 2개**(`rx(lng,lat)` / `ry(lng,lat)`)를 컴포넌트 안에 두고 위 6곳을 그것으로 바꾼다. `bearing === 0` 이면 `lx/ly` 와 동일 값을 반환해야 한다(킬스위치 off 경로 불변).

`labelDeclutter.ts`(`computeVisibleLabels`) 입력 좌표도 **회전 후 좌표**여야 겹침 판정이 맞는다.

> **주의(회전 중심 정합)**: 도시 윤곽(`:1223`)은 폴리곤 좌표를 인라인으로 만들지만 `<g>` **안**이라 그룹 회전을 받는다. `<g>` 안/밖을 옮길 때 이 구분을 헷갈리면 배경만 돌거나 배경만 안 도는 결함이 난다.

---

## 4. D-C — 오버스캔: 나침반 모드는 L2 고정

회전 시 화면을 덮으려면 viewBox 가 `(|cosθ| + |sinθ|)` 배 넓어야 한다 — 45° 에서 √2, **면적 2배**. 그만큼 피처가 2배로 늘어난다.

L3 는 건물/도로 상세다(`L3_VBW = BASE_W * 0.07`, ~1km). **저사양 Android + 불안정 4G 타깃**(기존 설계 제약)에서 L3 피처 2배는 프레임이 무너지는 구간이다.

### 결정

**나침반 모드에서는 L3 를 렌더하지 않는다 (L2 고정).**

- 제품 근거: 이동 중에 필요한 건 **도로 단위**이지 건물 단위가 아니다. 네비 앱들도 주행 중에는 건물 디테일을 낮춘다.
- 구현: 기존 LOD 임계값(`L3_VBW`)에 `bearing !== 0` 조건을 AND 로 추가. `L3_ENABLED` 플래그 선례(`:69`)와 같은 방식.
- 컬링: `:179` 피처 컬링과 `:662` "가시-안전 사각형"은 축정렬 기준이다. 회전 시 가시영역이 기울어진 사각형이 되므로 **컬링 사각형을 회전 bbox 로 확장**한다(L2 만 남으므로 비용 감당 가능).

---

## 5. D-D — follow 는 상시가 아니라 3-state 토글

### 기존 결정 확인 (반대 근거)

- `SaigonMapV5.tsx:845` — "**카메라는 따라가지 않는다** — 표시 전용 (service-rules 원칙 5)". 이 주석 자체가 대표 지적(2026-08-05 "gps 로 표시는 하는데 실시간 반영을 안 한다")에 대한 응답으로, **점은 추종하되 카메라는 고정**을 의도적으로 선택한 기록이다.
- `service-rules.md:93` — **"탐색과 안내는 분리한다."** RideNav 도 카메라 연출·GPS watch·이탈 판정을 사용자가 **[경로 안내 시작]** 을 탭할 때만 켠다.
- 마켓·동네지도는 팬/줌 **탐색** 화면이고 "안내 시작"에 해당하는 액션이 없다. 상시 follow 는 사용자 팬을 즉시 되돌려 탐색을 불가능하게 만든다.

### 결정 — 세 번째 안

상시 ON 도 아니고 미도입도 아니다. **recenter 버튼을 3-state 로 만든다** (표준 지도 앱 패턴):

```
[자유]  → 탭 → [추종]        카메라가 사용자 위치를 따라감. bearing=0(북 고정)
        → 탭 → [추종+나침반]  진행방향으로 회전. L2 고정(D-C)
        → 탭 → [자유]
사용자가 팬/줌 제스처를 하면 → 자동으로 [자유] 로 이탈
```

- `service-rules:93` 원칙과 충돌하지 않는다 — 추종은 **명시적 사용자 액션**으로만 켜진다
- 대표 요구("이동하면 지도가 따라온다")를 충족한다
- `:845` 의 기본 동작(표시 전용)은 **기본 상태로 보존**된다

> **`service-rules.md` 갱신 필요** — *개정(2차)에서 위치 정정*: 원안은 "원칙 5 갱신"이라 썼지만 **오기다.** 2026-08-06 전면 개정으로 GPS 원칙 5 는 지금 "좌표는 persist 하지 않는다"(`service-rules.md:20`)이고, "카메라 미추종"을 서술하는 곳은 **§지도 렌더 절**(`:83` 부근 "카메라는 GPS 중심(`locateOnMount`)…")과 `SaigonMapV5.tsx:845` 주석뿐이다. 따라서 갱신 대상은:
> 1. `service-rules.md` §지도 렌더 — "**기본은 미추종. 사용자가 ◎ 를 눌러 추종/나침반 모드를 명시적으로 켠 경우에만 추종하며, 팬·핀치 제스처는 즉시 자유 모드로 되돌린다**" 추가
> 2. `SaigonMapV5.tsx:845` 주석의 "(service-rules 원칙 5)" 참조 — 폐기된 번호를 가리키고 있다
>
> 이 갱신 없이 코드만 바꾸면 다음 세션이 회귀로 오인한다.

---

## 6. D-E / D-F — 워처와 `focusLatLng`

### D-E. 위치 워처를 새로 만들지 않는다 *(개정 2차 — 메커니즘 정정)*

`service-rules.md:22` 원칙 7 — **이동 추종은 앱 전역 1개.** `startWatching()` 은 `App.tsx` 에서만 호출한다(화면마다 걸면 워처 중복). 원칙 10 — 좌표가 확정된 뒤에만 시작한다(권한창이 프리프롬프트를 앞지른다).

**원안("`useLocationStore` 를 소비만 한다")은 성립하지 않는다.** 사실 확인:

- `useLocationStore` 의 상태에는 **`heading`·`speed` 필드가 아예 없다**(`store/useLocationStore.ts:48-52` — `coords`/`wardName`/`coordsSource` 뿐).
- 워처가 **30 m 이동 게이트**를 걸고 있다(`WATCH_MIN_MOVE_M = 30`, `:96`·`:275`). 설령 heading 을 실어도 30 m 마다 한 번만 갱신돼 회전이 계단처럼 튄다. 이 게이트는 원칙 7 의 재발화 폭탄을 막는 장치라 **풀 수 없다.**
- 반면 `SaigonMapV5` 는 **이미 자체 `native.watchLocation` 을 걸고 있다**(`:846-855`, meDot 실시간 추종 — 점이 한 번 찍힌 뒤에만 건다). 이 콜백은 `native.ts:177-186` 이 넘기는 `{ lat, lng, accuracy, speed, heading }` 전체를 받고 있고 **`speed`·`heading` 을 버리고 있다.**

→ **결정: 워처를 새로 만들지 않는다 = 이미 있는 meDot 워처의 콜백에서 `heading`·`speed` 를 함께 읽어 bearing 소스로 쓴다.** `useLocationStore` 를 확장하지 않고, `native.watchLocation` 호출을 새로 추가하지도 않는다(호출 수 불변 — §8 의 계약 테스트로 고정).

### D-F. follow 는 `focusLatLng` 를 경유하지 않는다

**기존 결함 (회전과 별개로 존재, 선행 수정 대상):**

```js
// SaigonMapV5.tsx:732-742
if (idx >= 0 && opts?.selectRegion !== false) {
  setSelWard(idx); loadWardData(slug); onRegionSelect?.(region);
} else if (idx >= 0) {
  setSelWard(idx);            // ← selectRegion:false 인데도 실행됨
  loadWardData(slug, false);  // ← 여기도
}
```

`selectRegion: false` 가 건너뛰는 것은 `onRegionSelect` 콜백뿐이고, **`setSelWard` + `loadWardData` 는 무조건 실행된다.** 현재는 mount 1회 호출이라 드러나지 않는다.

→ **follow 가 GPS 틱마다 `focusLatLng` 를 부르면 ward 데이터 로드가 매 틱 발화한다.** 따라서:

1. follow 는 카메라 중심만 갱신하는 **별도 경로**(`setCameraCenter(lat,lng)`)를 쓴다 — 지역 선택과 무관하게
2. `focusLatLng` 의 위 결함은 **별건으로 선행 수정**한다 (`selectRegion:false` 면 `setSelWard`·`loadWardData` 도 건너뛰도록)

---

## 7. 착수 순서

> **개정(2차)**: step 1 완료 반영, "V6 골격 신설" → "prop 추가"(D-H), 회전 계층 단일화(D-G) 반영, 비율 불변식·heading 주입 단계 신설, 마지막 문서 동기화 대상 정정.

```
1. ✅ 완료 — V5 현행 커밋 (회전 없음, 동작 보존)
      롤백 기준점 = e9c072f (작업트리 정리 완료). 회전 참조 구현 = d89041d (RideNav course-up)
2. ✅ 완료 (639b48b) — focusLatLng selectRegion:false 결함 수정 + 계약 테스트 (D-F)
3. ✅ 완료 (dd53b7d) — enableFollowCompass prop + 킬스위치 계약 테스트 (회전 코드 0줄, §8)
4. ✅ 완료 (66ada52) — vb 비율 불변식 재확인 — 나침반 진입·리사이즈 시 vb.h = vb.w×ar (§2.3)
5. ✅ 완료 (ae16020) — 지형 회전 <g> + 좌표 회전 헬퍼 (라벨·마커 6곳 + anchorOverlay, D-G/D-B, §3.3)
6. ✅ 완료 (08cd1e3) — rotateVec + 제스처 역회전 (휠/핀치중심/팬/탭 4곳, §2.5)
7. ✅ 완료 (916509d) — 컬링 사각형 회전 bbox 확장 + L3 게이트 (D-C)
8. ✅ 완료 (fc99654) — 3-state 토글 UI + 기존 meDot 워처에서 heading/speed 소비 (D-D/D-E/D-I)
9. ✅ 완료 (88bd487) — readDevGpsOverride() heading/speed 통과 (§9.4) — /dev/gps 회전 e2e 는 스택 미구동으로 실행 확인 못함(작업 보고 참조)
10. ✅ 완료 (본 커밋) — service-rules.md §지도 렌더 갱신 + SaigonMapV5:977 주석 참조 정정("원칙 5" → "§지도 렌더")
```

**3번 검증 기준이 핵심이다** — prop 미전달 상태에서 현행과 **DOM 이 동일**해야 한다. 여기서 어긋나면 회전 이전에 이미 회귀가 들어간 것이다.

**5번과 6번의 순서가 원안과 바뀌었다** — 먼저 회전을 눈에 보이게 만든 뒤(5) 제스처를 맞춘다(6). 반대로 하면 역회전이 맞는지 확인할 화면이 없다.

**감독 추가 작업 2건 (§7 에 없던 갭, 완료)**:
- 탭 히트테스트(`depth1.wards.findIndex(... wardInView(i, vb) ...)`)가 회전 미적용 축정렬 `vb` 를 써서, 나침반 모드에서 회전된 화면 모서리를 탭하면 엉뚱한 동으로 잡히거나 못 잡히던 실제 결함 — `rotatedBBoxOfRect` 를 재사용해 수정 (`748e1b6`).
- `enableFollowCompass` 를 실제로 배선한 소비처가 0곳이라 기능이 앱에서 관찰되지 않던 문제 — 동네지도(`NeighborhoodMapCanvas`)·마켓지도(`MarketMain`) 2곳에만 배선, 나머지 6곳(위치 피커·정보 지도)은 미배선 유지 (`36c0b04`).

---

## 8. D-H — V6 신규 컴포넌트를 만들지 않고 `SaigonMapV5` 에 prop 을 추가한다 *(신설, 개정 2차)*

사용자 결정(2026-08-06): **새 컴포넌트를 복제 신설하지 않는다. `SaigonMapV5` 에 회전을 prop 으로 추가하고, prop 을 주지 않으면 기존 동작과 완전히 동일하다(기본 off 킬스위치).**

### 8.1 근거 — 방치 렌더러가 이미 2벌 있다 (grep 확인)

| 파일 | 상태 |
|---|---|
| `maps/SaigonMapV2.tsx` (33 KB) | **어디서도 import 되지 않는다.** `maps/SaigonMapV2` / `from './SaigonMapV2'` 검색 0건 — 남은 언급은 주석·문서뿐 |
| `maps/SaigonDistrictMap.tsx` (24 KB) | `InfoMap.tsx` 만 쓰고, `InfoMap` 은 `InfoHub.tsx:320` 1곳뿐. 마지막 실질 수정 `4d5769c`(2026-08-01, 이력 초기화 커밋) |
| `SaigonMapV3.module.css` / `SaigonMapV4.module.css` | `.tsx` 가 없다 — 삭제 잔해 (※ 이번 범위에서 지우지 않는다, 언급만) |

`SaigonMapV5` 소비처는 **8곳**이다: `NeighborhoodMapCanvas:1112` · `MarketMain:593` · `BizLocationPicker:79` · `BizPublic:364` · `LocationPickerSheet:86` · `InfoFloodMap:407` · `InfoRepairList:192` · `InfoGasList:204`. V6 를 복제하면 렌더러가 3벌(V5/V6 + 방치 V2)로 갈리고 8개 소비처가 어느 쪽을 쓰는지 분기한다.

### 8.2 prop 계약

```ts
/**
 * 카메라 추종 + 나침반 회전을 켠다.
 * **기본 false — 미지정 시 기존 동작과 완전히 동일하다(킬스위치).**
 * true 면 ◎ 버튼이 3-state(자유→추종→추종+나침반)로 순환한다(D-D).
 */
enableFollowCompass?: boolean;      // 기본값 false

/** 3-state 변화 통지(옵션). 부모 UI 동기화·e2e 관측용 — 미전달 시 무동작. */
onFollowModeChange?: (mode: 'free' | 'follow' | 'compass') => void;
```

**이름·타입·기본값**: `enableFollowCompass?: boolean`, 구조분해 기본값 `= false`. 두 번째 prop 은 관측 전용 옵션이다.

### 8.3 off 경로 동일성을 **어떻게 보장하는가**

1. **회전 `<g>` 를 조건부 렌더한다.** `enableFollowCompass` 가 false 면 `<g>` 요소 자체를 만들지 않는다. `rotate(0)` 는 시각적 항등이지만 요소 트리가 달라져 "동일"을 주장할 수 없다.
2. 좌표 회전 헬퍼는 `bearing === 0` 에서 `lx/ly` 와 **같은 수를 반환**해야 한다(부동소수 연산을 추가하지 말고 `if (bearing === 0) return lx(lng)` 로 early return).
3. ◎ 버튼: prop false → 현행 `recenterCurrentContext` 그대로. true 일 때만 3-state 순환.
4. 워처: prop false → heading/speed 를 읽지 않는다(기존 meDot 좌표 갱신만).
5. LOD·컬링: prop false → `bearing` 이 상수 0 이므로 D-C 의 `bearing !== 0` 게이트가 항상 거짓 → L3·컬링 사각형 현행 유지.

### 8.4 회귀 검증 절차 (활용 가능한 하네스)

| 층 | 하네스 | 신뢰도 | 무엇을 고정하나 |
|---|---|---|---|
| (a) 정적 계약 | 신규 `frontend/src/components/maps/saigonMapV5RotationKillswitch.contract.test.mjs` (`node:test` + 소스 정규식) | **높음** — CI 가 `node --test $(find src -name "*.test.mjs")` 로 자동 수집(`.github/workflows/ci.yml:81`), 외부 스택 의존 0. 같은 폴더에 선례 2건(`saigonMapV5AssetFailure`, `saigonMapV5AssetLoadSeq`) | ① `enableFollowCompass?: boolean` 선언 존재 ② 구조분해 기본값이 `false` ③ 회전 `<g>`·3-state 분기가 그 플래그로 게이트됨 ④ **`native.watchLocation` 호출이 파일 내 1곳뿐**(워처 증식 감시, D-E) |
| (b) DOM 동등성 | Playwright (`frontend/e2e/`, `:18090` 구동 스택 대상, Desktop Chrome, `retries: 0`). 로그인·동의·좌표 고정 헬퍼가 이미 있다 — `e2e/helpers.ts` 의 `devLogin`/`injectSession`/`saveConsentViaApi`. 참고 선례: `me-dot.spec.ts`, `map-consistency.spec.ts`, `me-dot-live.spec.ts` | **중간** — 살아 있는 dev 스택과 dev DB 계정 생성에 의존해 환경 의존성이 있다. `fullyParallel:false`·`retries:0` 이라 실패는 그대로 드러난다 | prop 미전달 소비 화면 2곳(`NeighborhoodMapCanvas:1112`, `MarketMain:593`)에서 동일 좌표·동일 줌으로 `<svg>` outerHTML 을 떠 **변경 전 커밋과 diff 0** |
| (c) 회전 자체 | `/dev/gps` 하네스 + `dev-gps-harness.spec.ts` | **§9.4 확장 후에만 가능** | bearing≠0 동작 |

**(b) 의 기준선 뜨는 방법**: `e9c072f` 체크아웃 상태에서 outerHTML 을 파일로 저장 → 구현 후 같은 스펙을 다시 돌려 문자열 비교. 좌표는 `test.use({ geolocation })` 로 고정하고(선례 `me-dot-live.spec.ts:14`) 초기 뷰포트 복원(`initialViewport`, localStorage)을 비워 시작 상태를 같게 만든다.

> **기존 e2e 중 신뢰 가능한 것**: 지도 관련 스펙은 2026-08-06 GPS 개편에 맞춰 이미 개정됐다(`map-consistency.spec.ts` 헤더에 개정 이력 명시 — P1/P3/P4/P6 계약이 뒤집힌 것을 반영 완료). 따라서 `map-consistency` / `me-dot` / `me-dot-live` / `dev-gps-harness` 4종은 **현행 계약과 정합**이고, 3번 단계 후 이 4종이 그대로 PASS 해야 한다(회귀 게이트). 이 문서 작성 시점에 실행하지는 않았다 — 실행 결과는 T3 가 기록한다.

---

## 9. D-I — heading(방위) 소스 확정 *(신설, 개정 2차 — 원안 §미결 해소)*

### 9.1 실제로 노출되는 값

- `native.watchLocation(handler)` → `handler({ lat, lng, accuracy, speed, heading })` (`lib/native.ts:177-186`). `heading` = `pos.coords.heading`, `speed` = `pos.coords.speed`(m/s). 둘 다 **nullable** — Geolocation 규격상 정지·미지원 시 `null` 이다. 즉 **course-over-ground(진행 방위)이며 자력계 나침반이 아니다.**
- `useLocationStore` — **`heading`/`speed` 를 노출하지 않는다.** 30 m 이동 게이트(`WATCH_MIN_MOVE_M`)도 걸려 있다. → bearing 소스로 쓸 수 없다(§6 D-E 정정 근거).
- null 처리: `native.ts` 는 값을 그대로 넘기기만 하고 폴백을 두지 않는다. **null 정책은 소비자(이 화면)의 책임이다.**

### 9.2 1순위 소스가 없다

참조 구현(`MapCanvas`/`RideNav`)은 **경로 스냅 세그먼트 방위를 1순위**로 쓰고 GPS heading 은 "이탈 상태 + 1.5 m/s 이상"에서만 폴백으로 쓴다(`service-rules.md:97`). **마켓·동네지도에는 경로가 없다** → 1순위가 존재하지 않으므로 GPS course-over-ground 가 **유일 소스**다.

### 9.3 정지·저속 정책 — 마지막 유효 방위 유지

```
heading == null  ||  speed == null  ||  speed < 1.5 m/s   →  회전하지 않는다 (마지막 유효 방위 유지)
|Δbearing| < 8°                                            →  회전하지 않는다 (데드존)
그 외                                                       →  center + bearing 을 한 번의 갱신으로 적용
```

- **임계 속도 1.5 m/s 는 참조 구현 값을 그대로 쓴다.** 같은 워처·같은 필드에서 오는 같은 신호이므로 값을 다르게 둘 근거가 없다(두 화면이 다른 임계를 쓰면 사용자에게 일관성 없는 회전이 된다).
- **데드존 8°(`COURSE_DEADZONE_DEG`, `MapCanvas.tsx:27`)도 그대로 쓴다.** 단 참조 구현은 이 값을 **경로 세그먼트 방위**(계단형·안정)에 적용했고 여기서는 GPS heading(연속·노이즈)에 적용한다는 차이가 있다. 저속 구간에서 떨림이 남으면 **데드존을 키우지 말고 임계 속도를 올리는 쪽으로 조정한다** — 데드존 확대는 회전이 뚝뚝 끊겨 보여 체감이 더 나쁘다.
- 세 후보 중 **"마지막 유효 방위 유지"를 채택**하고, "임계 속도 이하 회전 정지"는 그 구현 수단이며, "데드존 확대"는 채택하지 않는다(위 사유).

### 9.4 DeviceOrientation(자력계 나침반) — 미도입 유지

참조 구현과 **같은 판단**이다. 근거 3:
1. `@capacitor/motion` 계열이 **의존성에 없다**(`frontend/package.json` 확인) — 신규 네이티브 플러그인 도입은 이 작업 범위를 넘는다.
2. 두 지도가 서로 다른 방위 소스를 쓰면 같은 사용자에게 회전 동작이 달라진다.
3. 마켓·동네지도는 **탐색** 화면이다. 정지 중 몸을 돌릴 때 지도가 도는 것은 팬/줌 탐색을 오히려 방해한다 — 정지 시 회전 정지(9.3)가 이 화면의 성격에 더 맞다.

### 9.5 검증 공백 — heading 을 주입할 수단이 지금은 없다

- `readDevGpsOverride()` 가 **`heading: null, speed: null` 을 하드코딩**한다(`lib/native.ts:571`) → `/dev/gps` 하네스로 이동을 재현해도 회전은 절대 발생하지 않는다.
- Playwright 의 `geolocation` 컨텍스트 옵션은 lat/lng/accuracy 만 지원한다 → e2e 로도 주입 불가.

→ **`readDevGpsOverride()` 가 localStorage JSON 의 `heading`·`speed` 를 옵션으로 통과시키게 확장한다**(없으면 종전대로 null). 기존 2중 게이트(호스트 허용목록 + `__dev_gps` opt-in 키, `service-rules` 원칙 12)는 그대로이므로 보안 표면이 늘지 않는다. 이것이 회전을 자동검증 가능하게 만드는 유일한 경로다 — §7 step 9.

---

## 10. 미결 / 후속

> **개정(2차)**: heading 소스 항목은 **D-I(§9)로 해소**돼 이 목록에서 내렸다.
> **개정(3차, step 1~10 완료 후)**: 알려진 갭 2건을 아래에 명시한다.

- **알려진 갭 1 — 쿼리 bbox 가 미회전이다.** `onBboxChange`/`onRawViewportChange` 가 emit 하는 "가시-안전 사각형"은 회전 전 축정렬 `vb` 기준이다(렌더 컬링·탭 히트테스트는 `rotatedBBoxOfRect` 로 고쳤지만, 이 두 콜백은 의도적으로 남겨뒀다 — step 7 워커). 나침반 모드에서 회전된 화면 모서리에 들어온 콘텐츠(업체·매물 등)가 백엔드 조회에서 누락될 수 있다. 백엔드 콘텐츠 쿼리와 뷰포트 복원/크로스헤어 소비자에 영향이 있어 **별건 판단이 필요하다** — 이번 범위에서 고치지 않는다.
- **알려진 갭 2 — iOS/Android orientation 혼재.** iOS 는 landscape 를 허용하고 Android 는 portrait 고정이라, 컨테이너 비율 변화에 대응하기 위해 `ResizeObserver`(§2.3, step 4)를 추가했다. **iOS 도 portrait 고정하면 `ResizeObserver` 자체가 불필요해진다** — 앱 전역 제품 결정으로 남긴다.
- **maplibre 전환 대안**: 회전·컬링·라벨 배치를 엔진이 처리하는 경로. `maplibre-gl` 은 이미 의존성에 있고 `MapCanvas` 에 동작 선례가 있다. 12,518줄 자작 지도의 대체 범위 산정이 필요하므로 **이번 결정에서 제외한다(재논의 금지).** 회전 도입 이후 회전 관련 결함이 반복되면 그때 재검토 대상으로 남긴다.
- `260806_proximity_ad_design.md` §1 의 "(`follow` + 나침반 회전)" 서술은 `MapCanvas`(maplibre) 기준이었다. 마켓·동네지도에는 D-D(3-state) 로 성립한다는 단서 필요 — **문서 커밋 담당이 반영.**
- **`ResizeObserver` 부재**(§2.3) 는 회전과 무관하게 존재하는 기존 한계다. 회전을 켤 때 §7 step 4 가 이를 부분적으로 메우지만, 컨테이너 비율 변화 일반에 대한 대응은 별건으로 남는다.
- `SaigonMapV3.module.css` / `SaigonMapV4.module.css` 는 `.tsx` 가 없는 삭제 잔해다 — **언급만 하고 이번 범위에서 지우지 않는다.**
- **범위 밖(다시 열지 말 것)**: 3D 틸트, 다중 회전모드, 이징 커스터마이즈, 회전 계층 재논의(D-G 확정).
