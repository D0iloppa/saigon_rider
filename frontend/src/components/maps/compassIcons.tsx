import type { CSSProperties } from 'react';

// 나침반/헤딩추종 아이콘 — 원래 SaigonMapV5.tsx 안에 인라인 정의돼 있었으나(W15, 2026-08-07),
// W17(2026-08-08)에서 길찾기(RideNav/MapControls)도 같은 정의를 쓰도록 공용 모듈로 뺐다. 동네지도와
// 길찾기는 별개 컴포넌트라 코드를 공유하지 않지만(감독 지시), 아이콘만은 "정의 통일"이 목적이라
// 이 파일 하나를 두 화면이 함께 import 한다. 나머지(상태기계·회전 소스)는 각 화면 고유 로직 그대로.

/**
 * 나침반 로즈 아이콘 (W15, 2026-08-07) — 북향복귀 버튼 전용. lucide 에는 `N` 표기가 있는 나침반이
 * 없어(`Compass` 는 원 안 대각선 바늘뿐) 직접 그린다. 대표 지적: 이 버튼과 ◎ 의 heading 상태가
 * 둘 다 `<Navigation rotate(-bearing)>` 이라 주황 버튼 두 개가 같은 모양으로 나란히 떠 버그처럼
 * 보였다 — 형태를 완전히 갈라 놓는 것이 이 아이콘의 목적이다.
 *
 * 작은 통(16~20px)에서 `N` 이 뭉개지지 않게 한 방법(Playwright 로 1×·4× 스크린샷 비교해 4개 변형
 * 중 선택):
 *  1) 링을 상단 ±30° 끊어(arc gap) `N` 을 그 위에 얹는다 — 링 안쪽에 넣으면 바늘과 세로 공간을
 *     다퉈 둘 다 작아지고, 링과 겹치면 회전 시 글자와 링이 뭉쳐 번개(⚡) 처럼 읽힌다.
 *  2) `N` 을 <text> 가 아니라 **스트로크 path** 로 그린다 — 폰트 힌팅·글꼴 의존 없이 5.4/24 높이,
 *     굵기 2.0 을 그대로 보장한다(20px 렌더에서 ~4.5px 높이 · ~1.7px 굵기).
 *  3) 라운드 캡을 쓰지 않는다 — 5.4 단위 높이에 굵기 2.0 이면 라운드 캡이 획 길이의 1/3 을
 *     먹어 첫 시도(round cap)에서 실제로 지그재그 덩어리로 보였다. 각진 캡이 각을 살린다.
 *  4) 아이콘만 20px 로 키운다(버튼은 32px 유지) — 스트로크가 기존 16px 아이콘(2.2)보다 얇아
 *     시각 무게는 맞는다.
 * 북침은 빨강, 남침은 회색(무채색)으로 대비. 회전은 호출부가 rotate(-bearing) 으로 준다.
 */
export function CompassRoseIcon({ size = 20, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} aria-hidden focusable="false">
      {/* 링 — 중심 (12,13.8) r=8.2, 상단 ±30° 를 비운 호 */}
      <path d="M16.1 6.7A8.2 8.2 0 1 1 7.9 6.7" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      {/* N — 링이 끊긴 자리 위에 각진 스트로크로 */}
      <path d="M9.3 6.3V0.9l5.4 5.4V0.9" stroke="currentColor" strokeWidth={2} />
      {/* 북침(빨강) / 남침(회색) */}
      <path d="M12 7.4 14.8 13.8H9.2Z" fill="#e5342b" />
      <path d="M12 20.8 14.8 13.8H9.2Z" fill="#9ca3af" />
    </svg>
  );
}

/**
 * heading 추종 상태 아이콘 (W15, 2026-08-07) — 내 위치 점 + 앞을 향한 시야각(cone). 위 나침반
 * 로즈(링+N+바늘)와 실루엣이 겹치지 않는다: 이쪽은 링도 글자도 없는 "점+부채꼴" 한 덩어리다.
 * **회전을 붙이지 않는다** — ◎ 3상태는 회전이 아니라 형태로만 구분한다(대표 지시).
 */
export function HeadingConeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path d="M12 15.5 5.12 5.67A12 12 0 0 1 18.88 5.67Z" fill="currentColor" opacity={0.5} />
      <circle cx={12} cy={15.5} r={3.4} fill="currentColor" />
    </svg>
  );
}
