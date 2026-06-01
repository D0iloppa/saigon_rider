import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

/** <html data-theme="..."> 에 반영. data-platform 과 동일하게 documentElement 에 세팅. */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
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
