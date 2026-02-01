/// <reference types="vite/client" />

// Re-export shared types
export * from '../../shared/types';
export * from '../../shared/preload-api';

// Extend Vite's ImportMetaEnv
declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string;
  }
}
