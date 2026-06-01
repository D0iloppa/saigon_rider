import { useEffect, useState } from 'react';
import spriteUrl from '@/assets/items/saigon-rider-items.svg?url';

// Safari/WebKit(iOS Safari·WebView 공통)은 display:none 컨테이너 안의
// gradient/filter 를 <use> 로 참조하면 해석하지 못해, gradient fill 아이템이
// 투명하게(=안 보이게) 렌더된다(데스크톱 Chrome 은 정상). 스프라이트를
// 렌더 트리에는 남기되 보이지 않게(width/height 0) 주입한다.
const HIDDEN_STYLE = 'position:absolute;width:0;height:0;overflow:hidden';

export function SpriteProvider() {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    fetch(spriteUrl)
      .then(r => r.text())
      .then(text => text.replace(/style="display:\s*none"/i, `style="${HIDDEN_STYLE}"`))
      .then(setSvg);
  }, []);

  if (!svg) return null;

  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
