/**
 * Stacks Blockchain Configuration
 * 
 * This file contains all the configuration needed to interact with
 * the payment-v5 smart contract on Stacks testnet/mainnet.
 * 
 * Network mode, contract address, and API URLs are driven by
 * VITE_* environment variables so they can be changed in Vercel
 * without code edits.
 */

import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

// Current network mode (defaults to testnet)
export const NETWORK_MODE: 'testnet' | 'mainnet' =
  (import.meta.env.VITE_NETWORK_MODE as 'testnet' | 'mainnet') || 'testnet';

// Network configurations
export const NETWORKS = {
  testnet: STACKS_TESTNET,
  mainnet: STACKS_MAINNET,
} as const;

export const CURRENT_NETWORK = NETWORKS[NETWORK_MODE];

// API endpoints
export const API_ENDPOINTS = {
  testnet: 'https://api.testnet.hiro.so',
  mainnet: 'https://api.mainnet.hiro.so',
} as const;

export const API_URL = import.meta.env.VITE_STACKS_API_URL || API_ENDPOINTS[NETWORK_MODE];

// Explorer URLs
export const EXPLORER_BASE = 'https://explorer.hiro.so';
export const EXPLORER_CHAIN_SUFFIX = NETWORK_MODE === 'testnet' ? '?chain=testnet' : '';

export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || EXPLORER_BASE;

// Payment contract configuration
const PAYMENT_CONTRACT_ADDRESS =
  import.meta.env.VITE_PAYMENT_CONTRACT_ADDRESS ||
  (NETWORK_MODE === 'testnet'
    ? 'STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR'
    : '');

const PAYMENT_CONTRACT_NAME =
  import.meta.env.VITE_PAYMENT_CONTRACT_NAME || 'payment-v5';

export const PAYMENT_CONTRACT = {
  address: PAYMENT_CONTRACT_ADDRESS,
  name: PAYMENT_CONTRACT_NAME,
} as const;
export const PAYMENT_CONTRACT_ID = `${PAYMENT_CONTRACT.address}.${PAYMENT_CONTRACT.name}` as const;

// sBTC token configuration
export const SBTC_CONFIG = {
  testnet: {
    address: 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT',
    name: 'sbtc-token',
    assetName: 'sbtc-token',
  },
  mainnet: {
    address: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4',
    name: 'sbtc-token',
    assetName: 'sbtc-token',
  },
} as const;

export const SBTC_TOKEN = SBTC_CONFIG[NETWORK_MODE];
export const SBTC_CONTRACT_ID = `${SBTC_TOKEN.address}.${SBTC_TOKEN.name}` as const;

// Platform constants
export const PLATFORM_FEE_BPS = 50; // 0.5%
export const SATS_PER_BTC = 100_000_000;
export const MIN_INVOICE_AMOUNT = 1000; // sats
export const MAX_INVOICE_AMOUNT = 100_000_000_000; // sats (1000 BTC)

// Block time (approximately 10 minutes on mainnet)
export const AVG_BLOCK_TIME_SECONDS = NETWORK_MODE === 'testnet' ? 120 : 600;

// Expiration presets (in blocks)
export const EXPIRATION_PRESETS = [
  { label: '1 Hour', blocks: 6 },
  { label: '24 Hours', blocks: 144 },
  { label: '7 Days', blocks: 1008 },
  { label: '30 Days', blocks: 4320 },
  { label: '1 Year', blocks: 52560 },
] as const;

/** Fetch the current burn (Bitcoin) block height from the Stacks API. */
let _cachedBurnHeight: { value: number; ts: number } | null = null;
export async function fetchBurnBlockHeight(): Promise<number> {
  // Cache for 60s to avoid hammering the API
  if (_cachedBurnHeight && Date.now() - _cachedBurnHeight.ts < 60_000) {
    return _cachedBurnHeight.value;
  }
  const res = await fetch(`${API_URL}/v2/info`);
  if (!res.ok) throw new Error('Failed to fetch block height');
  const data = await res.json();
  const h = data.burn_block_height as number;
  _cachedBurnHeight = { value: h, ts: Date.now() };
  return h;
}

// Utility functions
export function getExplorerTxUrl(txId: string): string {
  const cleanTxId = txId.startsWith('0x') ? txId : `0x${txId}`;
  return `${EXPLORER_URL}/txid/${cleanTxId}${EXPLORER_CHAIN_SUFFIX}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}${EXPLORER_CHAIN_SUFFIX}`;
}

export function getExplorerContractUrl(contractId: string): string {
  return `${EXPLORER_URL}/txid/${contractId}${EXPLORER_CHAIN_SUFFIX}`;
}

export function truncateAddress(address: string, chars = 6): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatSats(sats: number | bigint): string {
  return (Number(sats) / SATS_PER_BTC).toFixed(8);
}

export function satsToUsd(sats: number | bigint, btcPriceUsd: number): string {
  const btc = Number(sats) / SATS_PER_BTC;
  return (btc * btcPriceUsd).toFixed(2);
}

// Calculate fee for a given amount
export function calculateFee(amount: number | bigint): bigint {
  const amountBigInt = BigInt(amount);
  return (amountBigInt * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
}

// Calculate merchant receives after fee
export function calculateMerchantReceives(amount: number | bigint): bigint {
  const amountBigInt = BigInt(amount);
  const fee = calculateFee(amountBigInt);
  return amountBigInt - fee;
}
