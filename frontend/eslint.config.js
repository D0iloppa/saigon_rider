import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // react-hooks v7 new rules — warn for now, tighten later
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',

      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',

      // ── Native Bridge 강제: 브라우저 네이티브 API 직접 사용 금지 ──
      // Capacitor WebView 환경에서 브라우저 API는 권한 체계가 다르므로
      // 반드시 native.ts (NativeInterface)를 경유해야 한다.
      'no-restricted-globals': ['error',
        { name: 'navigator', message: 'Use native.ts (NativeInterface) instead of navigator.*. Direct browser API access bypasses Capacitor permission handling.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'navigator', message: 'Use native.ts (NativeInterface) instead of window.navigator.*.' },
      ],
    },
  },
);
