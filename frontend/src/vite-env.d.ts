/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG?: string;
  readonly VITE_SERVER_ADDRESS?: string;
  readonly VITE_SERVER_ADDRESS_HTTP?: string;
  readonly VITE_WEBSOCKET_HEADER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
