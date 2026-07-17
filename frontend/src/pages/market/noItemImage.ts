import noItemKr from '@/assets/market/no_item_kr.png';
import noItemVi from '@/assets/market/no_item_vi.png';
import noItemEn from '@/assets/market/no_item_en.png';
import i18n from '@/lib/i18n';

export function noItemImage(): string {
  const lang = i18n.language;
  if (lang === 'ko') return noItemKr; // i18n 코드 ko ↔ 파일명 kr 매핑 주의
  if (lang === 'vi') return noItemVi;
  return noItemEn; // en 및 기타 언어 기본값
}
