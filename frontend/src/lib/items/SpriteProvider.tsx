import { useEffect, useState } from 'react';
import spriteUrl from '@/assets/items/saigon-rider-items.svg?url';

export function SpriteProvider() {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    fetch(spriteUrl)
      .then(r => r.text())
      .then(setSvg);
  }, []);

  if (!svg) return null;

  return <div hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
