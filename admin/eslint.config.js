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
      // Omit fields via rest destructuring: const { secret: _, ...rest } = obj
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  // UI: rules for React hooks and for hot reload with "npm run dev:web".
  // set-state-in-effect doesn't treat setState after an await as asynchronous – so data an
  // effect loads is taken over with .then(setX, …) instead of in an async function
  {
    files: ['src/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
]);
