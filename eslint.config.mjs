// ESLint flat config (eslint 9 + typescript-eslint 8 + angular-eslint 22).
//
// Sigue la receta del scaffold de Angular (@angular-eslint/schematics):
// el bloque TS incluye el processor `processInlineTemplates` para que las
// plantillas inline de los componentes standalone se linteen como HTML sin
// que el parser de plantillas toque el TypeScript.
//
// Fuera de alcance (generados / no TS del app): android/, www/ (build),
// .angular/ (cache), supabase/functions/ (Deno: tiene su propio lint),
// docs/.
// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

export default defineConfig([
  {
    ignores: [
      'android/**',
      'www/**',
      '.angular/**',
      'node_modules/**',
      'supabase/functions/**',
      'docs/**'
    ]
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      angular.configs.tsRecommended
    ],
    processor: angular.processInlineTemplates,
    rules: {}
  },
  {
    files: ['**/*.html'],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility
    ],
    rules: {}
  }
]);
