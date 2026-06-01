import { useEffect, useState } from 'react';
import { api } from '@/api/client';

type CardImageMap = Record<string, string>;

let cache: CardImageMap | null = null;
let inflight: Promise<CardImageMap> | null = null;

async function fetchMap(): Promise<CardImageMap> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api.realFetch<CardImageMap>('/quest-cards/images').then((res) => {
      cache = res;
      return res;
    });
  }
  return inflight;
}

export function useQuestCardImages(): CardImageMap {
  const [map, setMap] = useState<CardImageMap>(cache ?? {});
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchMap()
      .then((res) => {
        if (!cancelled) setMap(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return map;
}
