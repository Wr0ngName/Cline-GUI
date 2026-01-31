/// <reference types="vite/client" />

// Re-export shared types
export * from '../../shared/types';
export * from '../../shared/preload-api';

// Extend ImportMeta for Vite
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
