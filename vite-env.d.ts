/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Optional real vision-extraction endpoint. If unset, the built-in mock extractor is used. */
  readonly VITE_VISION_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
