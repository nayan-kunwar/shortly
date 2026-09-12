import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Backend-only config. frontend/ brings its own ESLint in F0.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'frontend/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  prettierConfig,
  {
    // Plain-JS ops scripts run on Node (no tsconfig coverage).
    files: ['scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
