import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import nextVitals from 'eslint-config-next/core-web-vitals';

// กฎ lint ร่วมกันทั้ง monorepo
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // ห้ามใช้ any (ถ้าจำเป็นให้ปิดเฉพาะบรรทัดพร้อมคอมเมนต์เหตุผล)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  ...nextVitals.map((cfg) => ({ ...cfg, files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'] })),
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
    settings: { next: { rootDir: 'apps/web' } },
  },
);
