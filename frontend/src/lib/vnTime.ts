/**
 * 베트남 현지시각(ICT, UTC+7) 포맷터 — 앱 전체의 절대시각 표기 기준.
 *
 * **왜 필요한가** (대표 지적 2026-08-06):
 * `toLocaleTimeString(lang, …)` 은 `timeZone` 을 주지 않으면 **기기 타임존**을 쓴다.
 * 한국에서 보면 "오후 03:50 기준"(KST)으로 나오는데 현지는 13:50 이라 2시간 어긋났다.
 * 게다가 날씨 예보 시각은 백엔드가 OpenWeather 의 `dt_txt`(UTC 벽시계)를 그대로 넘겨
 * 한 화면에 KST 와 UTC 가 섞여 있었다 — 정작 ICT 는 어디에도 없었다.
 *
 * 이 앱은 베트남 사용자용이므로 **기기 설정과 무관하게 항상 ICT** 로 보여준다.
 * (해외에서 접속한 사용자에게도 "현지 시각"이 맞는 기준이다 — 매물·업체·날씨가 전부 현지 것이다.)
 */
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** ISO 문자열/Date/unix(ms) → 현지 시각 "HH:MM". */
export function formatVnTime(value: string | number | Date, locale?: string): string {
  return new Date(value).toLocaleTimeString(locale, {
    timeZone: VN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ISO 문자열/Date/unix(ms) → 현지 날짜. */
export function formatVnDate(
  value: string | number | Date,
  locale?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleDateString(locale, { timeZone: VN_TIME_ZONE, ...opts });
}

/** ISO 문자열/Date/unix(ms) → 현지 날짜+시각. */
export function formatVnDateTime(
  value: string | number | Date,
  locale?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleString(locale, { timeZone: VN_TIME_ZONE, ...opts });
}
