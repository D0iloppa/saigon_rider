export type Locale = "vi" | "ko" | "en";
export const LOCALES: Locale[] = ["vi", "ko", "en"];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_LABEL: Record<Locale, string> = { vi: "VI", ko: "KO", en: "EN" };

export function resolveLocale(pathname: string): Locale {
  if (pathname.startsWith("/ko")) return "ko";
  if (pathname.startsWith("/en")) return "en";
  return "vi";
}

export function localePath(locale: Locale): string {
  return locale === "vi" ? "/" : `/${locale}`;
}
