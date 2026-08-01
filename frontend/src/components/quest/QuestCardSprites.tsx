import riderSprite from '@/assets/quest-cards/rider-sprite.svg?raw';
import seasonSprite from '@/assets/quest-cards/season-sprite.svg?raw';
import mythicSprite from '@/assets/quest-cards/mythic-sprite.svg?raw';

// iOS Safari/WebView 는 외부 파일 <use href="x.svg#id"> 를 렌더하지 못한다.
// (참고: lib/items/SpriteProvider — 동일 제약). 스프라이트를 DOM 에 인라인 주입하고
// QuestCard 는 동일문서 참조 <use href="#card-XXX"> 로 그린다. ?raw 번들이라 캐시 무효화도 자동.
export function QuestCardSprites() {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: riderSprite + seasonSprite + mythicSprite }}
    />
  );
}
