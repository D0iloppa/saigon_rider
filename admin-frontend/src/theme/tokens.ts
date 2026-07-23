import { theme, type ThemeConfig } from 'antd'

export const adminColors = {
  chart: ['#4f7df0', '#2bbd8e', '#e0637f', '#d9a13b', '#16a29d', '#b29bee', '#868c00'],
  chartGrid: '#eceff3',
  error: '#dc2626',
  warning: '#d97706',
} as const

const sharedTheme: ThemeConfig = {
  cssVar: true,
  token: {
    colorPrimary: '#0f8f8b',
    colorLink: '#0d7672',
    colorInfo: '#2563eb',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorBgLayout: '#f5f7fa',
    colorBorder: '#e3e8ef',
    colorBorderSecondary: '#edf0f4',
    colorText: '#172033',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#64748b',
    borderRadius: 10,
    fontSize: 14,
    fontFamily: 'Inter, Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Layout: { siderBg: '#ffffff', headerBg: '#ffffff' },
    Menu: {
      itemBg: '#ffffff',
      itemColor: '#475569',
      itemHoverBg: '#f1f5f9',
      itemHoverColor: '#172033',
      itemSelectedBg: '#effbfa',
      itemSelectedColor: '#0f8f8b',
      itemBorderRadius: 8,
    },
    Table: { headerBg: '#f8fafc', headerColor: '#64748b', rowHoverBg: '#f0fafa' },
    Card: { borderRadiusLG: 12 },
    Button: { borderRadius: 8, fontWeight: 600, controlHeight: 36 },
    Tag: { borderRadiusSM: 999 },
    Input: { activeBorderColor: '#0f8f8b', hoverBorderColor: '#16a29d' },
  },
}

export const adminTheme: ThemeConfig = sharedTheme

export const adminDarkTheme: ThemeConfig = {
  ...sharedTheme,
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedTheme.token,
    colorBgBase: '#0f172a',
    colorBgLayout: '#0b1220',
    colorBgContainer: '#111c2e',
    colorBorder: '#29364a',
    colorBorderSecondary: '#202c3d',
    colorText: '#e7edf6',
    colorTextSecondary: '#aebbd0',
    colorTextTertiary: '#8290a6',
  },
  components: {
    ...sharedTheme.components,
    Layout: { siderBg: '#111c2e', headerBg: '#111c2e' },
    Menu: {
      itemBg: '#111c2e',
      itemColor: '#aebbd0',
      itemHoverBg: '#19263a',
      itemHoverColor: '#ffffff',
      itemSelectedBg: '#133b3d',
      itemSelectedColor: '#64d7d0',
      itemBorderRadius: 8,
    },
    Table: { headerBg: '#162235', headerColor: '#94a3b8', rowHoverBg: '#142c31' },
    Card: { borderRadiusLG: 12 },
    Button: { borderRadius: 8, fontWeight: 600, controlHeight: 36 },
    Tag: { borderRadiusSM: 999 },
    Input: { activeBorderColor: '#16a29d', hoverBorderColor: '#32bdb7' },
  },
}
