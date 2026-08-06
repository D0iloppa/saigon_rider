import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  Sun,
  type LucideIcon,
} from 'lucide-react';

/**
 * OpenWeather condition 코드 → 아이콘/번역키/색 매핑. **날씨를 표시하는 모든 화면의 단일 소스.**
 *
 * 홈 카드가 이 매핑을 쓰지 않고 해 아이콘을 하드코딩하고 있었다 — 그래서 부제는 "비 예보"인데
 * 아이콘은 해인 모순이 났다(대표 지적 2026-08-06). 화면마다 따로 그리면 또 어긋나므로
 * 여기 한 곳에서만 정의한다.
 *
 * 미등록 코드는 `null` — 호출부가 API 원문(`condition_desc`)이나 중립 아이콘으로 폴백한다.
 */
export interface WeatherConditionMeta {
  Icon: LucideIcon;
  /** `info.weather.<labelKey>` 아래의 i18n 키. */
  labelKey: string;
  color: string;
}

const CONDITION_META: Record<string, WeatherConditionMeta> = {
  Clear: { Icon: Sun, labelKey: 'cond_Clear', color: '#F59E0B' },
  Clouds: { Icon: Cloud, labelKey: 'cond_Clouds', color: '#8A8E9E' },
  Rain: { Icon: CloudRain, labelKey: 'cond_Rain', color: '#3B82F6' },
  Drizzle: { Icon: CloudDrizzle, labelKey: 'cond_Drizzle', color: '#60A5FA' },
  Thunderstorm: { Icon: CloudLightning, labelKey: 'cond_Thunderstorm', color: '#8B5CF6' },
  Mist: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
  Fog: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
  Haze: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
  Smoke: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
};

/** 미등록/미지정 코드는 null. */
export function weatherConditionMeta(condition?: string | null): WeatherConditionMeta | undefined {
  return condition ? CONDITION_META[condition] : undefined;
}

/** 아이콘이 꼭 필요한 자리(홈 카드 등)에서 쓰는, 폴백 포함 버전. */
export function weatherConditionIcon(condition?: string | null): { Icon: LucideIcon; color: string } {
  const meta = weatherConditionMeta(condition);
  // 미등록 코드에 해를 띄우면 "비인데 해"가 재발한다 — 중립 구름으로 폴백한다.
  return meta ? { Icon: meta.Icon, color: meta.color } : { Icon: Cloud, color: '#8A8E9E' };
}
