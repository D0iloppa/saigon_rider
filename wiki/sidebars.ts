import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  wikiSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Services',
      items: [
        'services/overview',
        'services/frontend',
        'services/bff',
        'services/engine',
      ],
    },
    {
      type: 'category',
      label: 'Private (Auth Required)',
      collapsed: false,
      items: [
        'private/architecture',
        'private/database',
      ],
    },
  ],
};

export default sidebars;
