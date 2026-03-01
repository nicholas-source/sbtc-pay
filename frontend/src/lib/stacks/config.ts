/**
 * Stacks Blockchain Configuration
 * 
 * This file contains all the configuration needed to interact with
 * the payment-v3 smart contract on Stacks testnet/mainnet.
 */

import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

// Current network mode
export const NETWORK_MODE: 'testnet' | 'mainnet' = 'testnet';

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

export const API_URL = API_ENDPOINTS[NETWORK_MODE];

// Explorer URLs
export const EXPLORER_URLS = {
  testnet: 'https://explorer.hiro.so/?chain=testnet',
  mainnet: 'https://explorer.hiro.so',
} as const;

export const EXPLORER_URL = EXPLORER_URLS[NETWORK_MODE];

// Payment contract configuration
export const CONTRACT_CONFIG = {
  testnet: {
    address: 'STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR',
    name: 'payment-v3',
  },
  mainnet: {
    address: '', // To be deployed
    name: 'payment-v3',
  },
} as const;

export const PAYMENT_CONTRACT = CONTRACT_CONFIG[NETWORK_MODE];
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

// Utility functions
export function getExplorerTxUrl(txId: string): string {
  const cleanTxId = txId.startsWith('0x') ? txId : `0x${txId}`;
  return `${EXPLORER_URL}/txid/${cleanTxId}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function getExplorerContractUrl(contractId: string): string {
  return `${EXPLORER_URL}/txid/${contractId}`;
}

export function truncateAddress(address: string, chars = 6): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatSats(sats: number | bigint): string {
  return Number(sats).toLocaleString();
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
