import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // Felder per Rest-Destrukturierung weglassen: const { secret: _, ...rest } = obj
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  // Oberfläche: Regeln für React-Hooks und für Hot Reload mit "npm run dev:web".
  // set-state-in-effect sieht setState nach einem await nicht als asynchron an – Daten, die ein
  // Effekt lädt, deshalb mit .then(setX, …) übernehmen statt in einer async-Funktion
  {
    files: ['src/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
]);
