import { useTranslation } from 'react-i18next';
import { itemNameKey } from '@/lib/items';

/**
 * 아이템 표시명 렌더러.
 * DB display_name 에는 item_code 가 저장되므로, 실제 이름은 i18n(items.<code>)에서 조회한다.
 * 키가 없으면 fallback(주로 mock 데이터의 item_name) → 그래도 없으면 code 를 표시.
 */
export function ItemName({ code, fallback }: { code: string; fallback?: string }) {
  const { t } = useTranslation();
  return <>{t(itemNameKey(code), { defaultValue: fallback ?? code })}</>;
}
