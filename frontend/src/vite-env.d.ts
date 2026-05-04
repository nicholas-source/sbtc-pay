/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK_MODE?: 'testnet' | 'mainnet';
  readonly VITE_STACKS_API_URL?: string;
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_PAYMENT_CONTRACT_ADDRESS?: string;
  readonly VITE_PAYMENT_CONTRACT_NAME?: string;
  /** Production origin used in embed code snippets, e.g. https://sbtcpay.com */
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
