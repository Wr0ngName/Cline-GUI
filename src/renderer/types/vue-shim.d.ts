/**
 * Module declaration for .vue files so TypeScript can resolve imports.
 * Used by the root tsconfig.json which doesn't have vue-specific resolution.
 *
 * eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vue SFC shim
 * needs permissive types to allow accessing component methods in tests.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<any, any, any>;
  export default component;
}
