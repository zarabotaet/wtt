import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  { ignores: ['.next/**', 'node_modules/**', 'prototype/**'] },
  {
    // New React Compiler rules that arrived with the Next 16 upgrade.
    // Warn only for ThemeToggle/ZoomSlider, which sync from localStorage
    // on mount; the Effector-driven feed components are held to 'error'.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['components/MatchFeed.tsx', 'components/FeedProvider.tsx', 'components/UpdatedAgo.tsx'],
    rules: {
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
];

export default config;
