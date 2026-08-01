/**
 * 신뢰 티어 — manner_temp(내부 스칼라, 리뷰 별점 누적 0~99)를 사용자에게
 * 노출할 때의 유일한 표현. 온도 은유(°C)는 노출하지 않는다.
 *
 * 배경: 당근이 매너온도 은유의 해외 실패("왜 온도?", 36.5 임의성)를 공식 인정하고
 * 점수+티어(Karrot Score)로 교체한 사례를 따름 — spec/design-uplift-260707.md §후속 1.
 * 내부 컬럼/계산(_recompute_manner_temp)은 그대로 두고 표현 계층만 티어로 매핑한다.
 *
 * 구간 근거: 시작값 36.5, 리뷰당 ±0.25~1.0 누적 → 신규는 'new'(30~39)에서 시작,
 * 꾸준한 호평으로 good(40)/trusted(55)/top(75) 승급. 30 미만은 악성 리뷰 다수.
 */
export type TrustTierKey = 'caution' | 'new' | 'good' | 'trusted' | 'top';

export function getTrustTier(temp: number): TrustTierKey {
  if (temp < 30) return 'caution';
  if (temp < 40) return 'new';
  if (temp < 55) return 'good';
  if (temp < 75) return 'trusted';
  return 'top';
}
