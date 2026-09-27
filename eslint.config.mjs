import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  { ignores: ['.next/**', 'node_modules/**', 'prototype/**'] },
  {
    // New React Compiler rules that arrived with the Next 16 upgrade.
    // Warn for now: MatchFeed's switching logic is being rewritten for the
    // IndexedDB-first cache, and ThemeToggle/ZoomSlider only sync from
    // localStorage on mount.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
