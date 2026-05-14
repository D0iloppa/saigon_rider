import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Saigon Rider Dev Wiki',
  tagline: 'Developer Documentation & Service Portal',
  favicon: 'img/favicon.ico',

  url: 'http://localhost:18090',
  baseUrl: '/wiki/',

  organizationName: 'saigon-rider',
  projectName: 'saigon-rider-wiki',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'ko',
    locales: ['ko'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          path: 'wiki-docs',
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Saigon Rider',
      logo: {
        alt: 'Saigon Rider',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'wikiSidebar',
          position: 'left',
          label: 'Docs',
        },
        // Docusaurus가 href에 baseUrl(/wiki/)을 자동으로 prepend하므로
        // type: 'html'로 raw anchor를 직접 렌더링하여 우회
        {
          type: 'html',
          position: 'right',
          value: '<a href="/api/bff/docs" class="navbar__item navbar__link">BFF Swagger</a>',
        },
        {
          type: 'html',
          position: 'right',
          value: '<a href="/api/sre/docs" class="navbar__item navbar__link">SRE Swagger</a>',
        },
        {
          type: 'html',
          position: 'right',
          value: '<a href="/admin/login" class="navbar__item navbar__link">Admin</a>',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Services',
          items: [
            {html: '<a href="/" class="footer__link-item">Frontend App</a>'},
            {html: '<a href="/api/bff/docs" class="footer__link-item">BFF Swagger</a>'},
            {html: '<a href="/api/sre/docs" class="footer__link-item">SRE Engine Swagger</a>'},
            {html: '<a href="/admin/login" class="footer__link-item">Admin Console</a>'},
          ],
        },
        {
          title: 'Docs',
          items: [
            {label: 'Intro', to: '/docs/intro'},
            {label: 'BFF API', to: '/docs/services/bff'},
            {label: 'SRE Engine', to: '/docs/services/engine'},
          ],
        },
      ],
      copyright: `Saigon Rider © ${new Date().getFullYear()} — Internal Dev Wiki`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'python', 'sql', 'nginx', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
