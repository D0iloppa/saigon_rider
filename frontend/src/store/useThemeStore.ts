import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { native } from '@/lib/native';

export type Theme = 'light' | 'dark';

/** <html data-theme="..."> 에 반영. data-platform 과 동일하게 documentElement 에 세팅. */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // 네이티브 컨테이너 배경을 테마 배경(--bg)에 맞춘다 — iOS 에서 키보드 리사이즈 중
  // 노출되는 영역이 검게 보이는 것 방지. data-theme 반영 후 다음 프레임에 값을 읽는다.
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) native.setBackgroundColor(bg);
  });
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'saigon-rider-theme',
      // 초기 페인트는 index.html 인라인 스크립트가 처리(FOUC 방지).
      // rehydrate 시 store 값과 DOM 을 한 번 더 동기화한다.
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
