# 가차 hang — 재진입 시 신규 화면 미연결 (SGR-205)

> 260602 · 상태: ✅ 해소 (배포·시각검증 완료, Plane SGR-205 DONE)

## 증상

- 가차 뽑기 진입 시 `SUMMONING…` 로딩 화면에서 hang(무한 정지) 발생.
- 특히 결과 화면에서 **"다시 뽑기"** 를 누르면 신규 뽑기로 넘어가지 못하고 로딩 화면에 영구 정지 → 15초 후 timeout 에러.
- 재진입 시 이전 결과 화면이 노출되고, 신규 가차 화면으로 연결되지 않음.

## 원인 분석

`frontend/src/pages/gacha/GachaPull.tsx`

뽑기 실행 로직이 `useEffect(..., [])`(빈 deps) + `didPull` ref 가드 안에 들어 있어 **컴포넌트 마운트 시 1회만** 실행되는 구조였다.

```tsx
const didPull = useRef(false);
useEffect(() => {
  if (!gachaCode || didPull.current) return;
  didPull.current = true;
  pullGacha(gachaCode, is10).then(...)  // 마운트 시 1회만
}, []);
```

"다시 뽑기" 버튼은 state만 리셋했다:

```tsx
onClick={() => {
  didPull.current = false;
  setResult(null); setPityAfter(null); setErrorMsg(null);
}}
```

→ `setResult(null)` 로 로딩 화면(`SUMMONING…`)으로 전환되지만, **빈-deps effect는 재실행될 수 없으므로** 새 `pullGacha` 호출이 일어나지 않는다. 결과적으로 로딩 화면에 영구 정지 = hang (15초 후 timeout 에러).

같은 이유로, 동일 라우트(`/gacha/pull/:gachaCode`)에서 파라미터만 바뀌어 재진입하는 경우에도 effect가 재실행되지 않아 이전 결과가 그대로 남는다.

## 영향 범위

- `GachaPull.tsx` — 모든 가차 종류(BASIC/PREMIUM/GC/SEASON/LEGEND)의 "다시 뽑기" 및 재진입 경로.

## 해결 방법

뽑기 로직을 `runPull()` `useCallback` 으로 추출하여 **마운트 effect와 "다시 뽑기" 버튼 양쪽에서 호출**한다.

1. **`runPull()` 추출** — state 리셋(`setResult/setPityAfter/setErrorMsg`) + timeout 설정 + `pullGacha` 호출(에러 시 잔액부족 메시지 파싱 포함)을 한 콜백으로 모음. deps: `[gachaCode, is10, t]`.
2. **마운트 가드를 param-key 로 변경** — boolean `didPull` 대신 `pulledKey` ref(`${gachaCode}-${is10}`)로 추적. StrictMode 이중 마운트는 막되, **파라미터가 바뀐 재진입에서는 신규 뽑기를 재실행**.
   ```tsx
   useEffect(() => {
     const key = `${gachaCode}-${is10}`;
     if (pulledKey.current === key) return;
     pulledKey.current = key;
     runPull();
     return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
   }, [runPull, gachaCode, is10]);
   ```
3. **timeout 을 `timeoutRef` 로 관리** — 재호출/언마운트 시 이전 timeout 을 정리.
4. **"다시 뽑기" 버튼** — `onClick={() => runPull()}` 로 단순화 (state 수동 리셋 제거).

## 후속 — SUMMONING 연출이 순식간에 지나감 → 시네마틱 연출로 확장

뽑기 응답이 즉시 도착하면 `SUMMONING…` 연출이 거의 노출되지 않고 결과로 점프해 임팩트가 사라진다는 피드백.

1차로 최소 노출 시간(`MIN_SUMMON_MS`) 지연을 넣었으나 "연출이 없다"는 피드백으로 **풀 시네마틱 뽑기 연출**로 확장 결정 → 별도 작업으로 추적: [task/active/260602_gacha_cinematic](../../task/active/260602_gacha_cinematic_reveal_task.md). 단순 지연(`MIN_SUMMON_MS`)은 해당 작업에서 charging 페이즈로 대체됨.

검증: `npx eslint src/pages/gacha/GachaPull.tsx` 0 errors(기존 `any` warning 1건 unchanged), `npx tsc --noEmit` 통과. 프론트 컨테이너 재빌드 완료. 브라우저 시각검증 → DONE 전환 예정.
