/**
 * Payment Contract Service
 * 
 * Provides methods to interact with the payment-v4 smart contract
 * using the latest @stacks/connect and @stacks/transactions APIs.
 */

import { request } from '@stacks/connect';
import { Cl, Pc, fetchCallReadOnlyFunction, cvToValue, type ClarityValue } from '@stacks/transactions';
import {
  PAYMENT_CONTRACT,
  PAYMENT_CONTRACT_ID,
  SBTC_TOKEN,
  SBTC_CONTRACT_ID,
  NETWORK_MODE,
  API_URL,
} from './config';

// Type for contract identifier
type ContractId = `${string}.${string}`;

// Type-safe contract identifiers
const PAYMENT_CONTRACT_TYPED = PAYMENT_CONTRACT_ID as ContractId;
const SBTC_CONTRACT_TYPED = SBTC_CONTRACT_ID as ContractId;

// Types for contract responses
export interface MerchantInfo {
  id: number;
  name: string;
  description: string | null;
  webhookUrl: string | null;
  logoUrl: string | null;
  totalReceived: bigint;
  totalRefunded: bigint;
  invoiceCount: number;
  subscriptionCount: number;
  registeredAt: number;
  isActive: boolean;
  isVerified: boolean;
}

export interface InvoiceInfo {
  id: number;
  merchant: string;
  amount: bigint;
  amountPaid: bigint;
  amountRefunded: bigint;
  memo: string;
  referenceId: string | null;
  status: number;
  payer: string | null;
  allowPartial: boolean;
  allowOverpay: boolean;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  refundedAt: number | null;
}

export interface SubscriptionInfo {
  id: number;
  merchant: string;
  subscriber: string;
  name: string;
  amount: bigint;
  intervalBlocks: number;
  status: number;
  paymentsMade: number;
  totalPaid: bigint;
  createdAt: number;
  lastPaymentAt: number;
  nextPaymentAt: number;
}

export interface PlatformStats {
  totalMerchants: number;
  totalInvoices: number;
  totalSubscriptions: number;
  totalVolume: bigint;
  totalFeesCollected: bigint;
  totalRefunds: bigint;
}

export interface ContractConfig {
  owner: string;
  feeRecipient: string;
  platformFeeBps: number;
  minInvoiceAmount: bigint;
  maxInvoiceAmount: bigint;
  maxExpiryBlocks: number;
  isPaused: boolean;
}

// Status mappings
export const INVOICE_STATUS = {
  0: 'pending',
  1: 'partial',
  2: 'paid',
  3: 'expired',
  4: 'cancelled',
  5: 'refunded',
} as const;

export const SUBSCRIPTION_STATUS = {
  0: 'active',
  1: 'paused',
  2: 'cancelled',
} as const;

// Error messages
export const CONTRACT_ERRORS: Record<number, string> = {
  1001: 'Not authorized',
  1002: 'Contract is paused',
  1003: 'Ownership transfer pending',
  2001: 'Merchant not found',
  2002: 'Merchant already exists',
  2003: 'Merchant inactive',
  2004: 'Merchant suspended',
  3001: 'Invoice not found',
  3002: 'Invoice already paid',
  3003: 'Invoice expired',
  3004: 'Invoice cancelled',
  3005: 'Invoice not payable',
  3006: 'Invalid amount',
  3007: 'Amount too low (min 0.00001000 sBTC)',
  3008: 'Amount too high',
  4001: 'Transfer failed',
  4002: 'Insufficient payment',
  4003: 'Overpayment not allowed',
  4004: 'Refund exceeds paid amount',
  4005: 'Already refunded',
  4006: 'No refund available',
  5001: 'Subscription not found',
  5002: 'Subscription inactive',
  5003: 'Subscription already exists',
  5004: 'Payment not due yet',
};

// Helper to deeply extract plain values from cvToValue's {type, value} wrappers (stacks v7+)
function deepUnwrapCv(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  const obj = val as Record<string, unknown>;
  if ('type' in obj && 'value' in obj && typeof obj.type === 'string') {
    const inner = obj.value;
    if (inner === null || inner === undefined) return null;
    // Recurse: inner may itself be a {type, value} wrapper (e.g. some(principal))
    const unwrapped = deepUnwrapCv(inner);
    if (unwrapped === null || unwrapped === undefined) return null;
    if (typeof unwrapped !== 'object') return unwrapped;
    // Tuple: recurse into each field
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(unwrapped as Record<string, unknown>)) {
      result[key] = deepUnwrapCv(field);
    }
    return result;
  }
  return val;
}

// Parse a ClarityValue returned from a read-only call into a plain JS value
function parseClarityValue(cv: ClarityValue): unknown {
  const raw = cvToValue(cv, true);
  if (raw === null || raw === undefined) return null;
  return deepUnwrapCv(raw);
}

// ============================================
// READ-ONLY FUNCTIONS
// ============================================

/**
 * Get merchant information
 */
export async function getMerchant(merchantAddress: string): Promise<MerchantInfo | null> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: PAYMENT_CONTRACT.address,
      contractName: PAYMENT_CONTRACT.name,
      functionName: 'get-merchant',
      functionArgs: [Cl.principal(merchantAddress)],
      network: NETWORK_MODE,
      senderAddress: merchantAddress,
    });

    const parsed = parseClarityValue(result);
    if (!parsed) return null;

    const data = parsed as Record<string, unknown>;
    return {
      id: Number(data['id'] ?? data['merchant-id']),
      name: String(data['name']),
      description: data['description'] ? String(data['description']) : null,
      webhookUrl: data['webhook-url'] ? String(data['webhook-url']) : null,
      logoUrl: data['logo-url'] ? String(data['logo-url']) : null,
      totalReceived: BigInt(data['total-received'] as string),
      totalRefunded: BigInt(data['total-refunded'] as string),
      invoiceCount: Number(data['invoice-count']),
      subscriptionCount: Number(data['subscription-count']),
      registeredAt: Number(data['registered-at']),
      isActive: Boolean(data['is-active']),
      isVerified: Boolean(data['is-verified']),
    };
  } catch (error) {
    console.error('Failed to get merchant:', error);
    return null;
  }
}

/**
 * Get invoice information
 */
export async function getInvoice(invoiceId: number, senderAddress: string): Promise<InvoiceInfo | null> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: PAYMENT_CONTRACT.address,
      contractName: PAYMENT_CONTRACT.name,
      functionName: 'get-invoice',
      functionArgs: [Cl.uint(invoiceId)],
      network: NETWORK_MODE,
      senderAddress,
    });

    const parsed = parseClarityValue(result);
    if (!parsed) return null;

    const data = parsed as Record<string, unknown>;
    return {
      id: invoiceId,
      merchant: String(data['merchant']),
      amount: BigInt(data['amount'] as string),
      amountPaid: BigInt(data['amount-paid'] as string),
      amountRefunded: BigInt(data['amount-refunded'] as string),
      memo: String(data['memo']),
      referenceId: data['reference-id'] ? String(data['reference-id']) : null,
      status: Number(data['status']),
      payer: data['payer'] ? String(data['payer']) : null,
      allowPartial: Boolean(data['allow-partial']),
      allowOverpay: Boolean(data['allow-overpay']),
      createdAt: Number(data['created-at']),
      expiresAt: Number(data['expires-at']),
      paidAt: data['paid-at'] ? Number(data['paid-at']) : null,
      refundedAt: data['refunded-at'] ? Number(data['refunded-at']) : null,
    };
  } catch (error) {
    console.error('Failed to get invoice:', error);
    return null;
  }
}

/**
 * Get subscription information
 */
export async function getSubscription(subscriptionId: number, senderAddress: string): Promise<SubscriptionInfo | null> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: PAYMENT_CONTRACT.address,
      contractName: PAYMENT_CONTRACT.name,
      functionName: 'get-subscription',
      functionArgs: [Cl.uint(subscriptionId)],
      network: NETWORK_MODE,
      senderAddress,
    });

    const parsed = parseClarityValue(result);
    if (!parsed) return null;

    const data = parsed as Record<string, unknown>;
    return {
      id: subscriptionId,
      merchant: String(data['merchant']),
      subscriber: String(data['subscriber']),
      name: String(data['name']),
      amount: BigInt(data['amount'] as string),
      intervalBlocks: Number(data['interval-blocks']),
      status: Number(data['status']),
      paymentsMade: Number(data['payments-made']),
      totalPaid: BigInt(data['total-paid'] as string),
      createdAt: Number(data['created-at']),
      lastPaymentAt: Number(data['last-payment-at']),
      nextPaymentAt: Number(data['next-payment-at']),
    };
  } catch (error) {
    console.error('Failed to get subscription:', error);
    return null;
  }
}

/**
 * Get platform statistics
 */
export async function getPlatformStats(senderAddress: string): Promise<PlatformStats | null> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: PAYMENT_CONTRACT.address,
      contractName: PAYMENT_CONTRACT.name,
      functionName: 'get-platform-stats',
      functionArgs: [],
      network: NETWORK_MODE,
      senderAddress,
    });

    const parsed = parseClarityValue(result);
    if (!parsed) return null;

    const data = parsed as Record<string, unknown>;
    return {
      totalMerchants: Number(data['total-merchants']),
      totalInvoices: Number(data['total-invoices']),
      totalSubscriptions: Number(data['total-subscriptions']),
      totalVolume: BigInt(data['total-volume'] as string),
      totalFeesCollected: BigInt(data['total-fees-collected'] as string),
      totalRefunds: BigInt(data['total-refunds'] as string),
    };
  } catch (error) {
    console.error('Failed to get platform stats:', error);
    return null;
  }
}

/**
 * Get contract configuration
 */
export async function getContractConfig(senderAddress: string): Promise<ContractConfig | null> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: PAYMENT_CONTRACT.address,
      contractName: PAYMENT_CONTRACT.name,
      functionName: 'get-config',
      functionArgs: [],
      network: NETWORK_MODE,
      senderAddress,
    });

    const parsed = parseClarityValue(result);
    if (!parsed) return null;

    const data = parsed as Record<string, unknown>;
    return {
      owner: String(data['owner']),
      feeRecipient: String(data['fee-recipient']),
      platformFeeBps: Number(data['platform-fee-bps']),
      minInvoiceAmount: BigInt(data['min-invoice-amount'] as string),
      maxInvoiceAmount: BigInt(data['max-invoice-amount'] as string),
      maxExpiryBlocks: Number(data['max-expiry-blocks']),
      isPaused: Boolean(data['is-paused']),
    };
  } catch (error) {
    console.error('Failed to get contract config:', error);
    return null;
  }
}

// ============================================
// CONTRACT STRING LENGTH LIMITS
// ============================================
export const CONTRACT_LIMITS = {
  MERCHANT_NAME: 64,
  DESCRIPTION: 256,
  WEBHOOK_URL: 256,
  LOGO_URL: 256,
  MEMO: 256,
  REFERENCE_ID: 64,
  SUBSCRIPTION_NAME: 64,
  REASON: 256,
} as const;

/** Validate string length against contract limits. Throws descriptive error. */
function validateStringLength(value: string, fieldName: string, maxLen: number): void {
  if (value.length > maxLen) {
    throw new Error(`${fieldName} is too long (${value.length}/${maxLen} characters)`);
  }
}

// ============================================
// WRITE FUNCTIONS (require wallet signature)
// ============================================

/**
 * Register as a merchant
 */
export async function registerMerchant(params: {
  name: string;
  description?: string;
  webhookUrl?: string;
  logoUrl?: string;
}): Promise<{ txId: string }> {
  // Validate input lengths against contract limits
  validateStringLength(params.name, 'Business name', CONTRACT_LIMITS.MERCHANT_NAME);
  if (params.description) validateStringLength(params.description, 'Description', CONTRACT_LIMITS.DESCRIPTION);
  if (params.webhookUrl) validateStringLength(params.webhookUrl, 'Webhook URL', CONTRACT_LIMITS.WEBHOOK_URL);
  if (params.logoUrl) validateStringLength(params.logoUrl, 'Logo URL', CONTRACT_LIMITS.LOGO_URL);

  const functionArgs = [
    Cl.stringUtf8(params.name),
    params.description ? Cl.some(Cl.stringUtf8(params.description)) : Cl.none(),
    params.webhookUrl ? Cl.some(Cl.stringUtf8(params.webhookUrl)) : Cl.none(),
    params.logoUrl ? Cl.some(Cl.stringUtf8(params.logoUrl)) : Cl.none(),
  ];

  console.log('[registerMerchant] Calling stx_callContract...');
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'register-merchant',
    functionArgs,
    network: NETWORK_MODE,
  });

  return { txId: response.txid ?? '' };
}

/**
 * Update merchant profile on-chain
 */
export async function updateMerchantProfile(params: {
  name: string;
  description?: string;
  webhookUrl?: string;
  logoUrl?: string;
}): Promise<{ txId: string }> {
  // Validate input lengths against contract limits
  validateStringLength(params.name, 'Business name', CONTRACT_LIMITS.MERCHANT_NAME);
  if (params.description) validateStringLength(params.description, 'Description', CONTRACT_LIMITS.DESCRIPTION);
  if (params.webhookUrl) validateStringLength(params.webhookUrl, 'Webhook URL', CONTRACT_LIMITS.WEBHOOK_URL);
  if (params.logoUrl) validateStringLength(params.logoUrl, 'Logo URL', CONTRACT_LIMITS.LOGO_URL);

  const functionArgs = [
    Cl.stringUtf8(params.name),
    params.description ? Cl.some(Cl.stringUtf8(params.description)) : Cl.none(),
    params.webhookUrl ? Cl.some(Cl.stringUtf8(params.webhookUrl)) : Cl.none(),
    params.logoUrl ? Cl.some(Cl.stringUtf8(params.logoUrl)) : Cl.none(),
  ];

  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'update-merchant-profile',
    functionArgs,
    network: NETWORK_MODE,
  });

  return { txId: response.txid ?? '' };
}

/**
 * Create an invoice
 */
export async function createInvoice(params: {
  amount: bigint;
  memo: string;
  referenceId?: string;
  expiresInBlocks: number;
  allowPartial: boolean;
  allowOverpay: boolean;
}): Promise<{ txId: string }> {
  // Validate input lengths
  validateStringLength(params.memo, 'Memo', CONTRACT_LIMITS.MEMO);
  if (params.referenceId) validateStringLength(params.referenceId, 'Reference ID', CONTRACT_LIMITS.REFERENCE_ID);

  const functionArgs = [
    Cl.uint(params.amount),
    Cl.stringUtf8(params.memo),
    params.referenceId ? Cl.some(Cl.stringUtf8(params.referenceId)) : Cl.none(),
    Cl.uint(params.expiresInBlocks),
    Cl.bool(params.allowPartial),
    Cl.bool(params.allowOverpay),
  ];

  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'create-invoice',
    functionArgs,
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Pay an invoice
 */
export async function payInvoice(params: {
  invoiceId: number;
  amount: bigint;
  payerAddress: string;
}): Promise<{ txId: string }> {
  const functionArgs = [
    Cl.uint(params.invoiceId),
    Cl.uint(params.amount),
  ];

  // Create post-condition to protect user's sBTC
  const postCondition = Pc.principal(params.payerAddress)
    .willSendLte(params.amount)
    .ft(SBTC_CONTRACT_TYPED, SBTC_TOKEN.assetName);

  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'pay-invoice',
    functionArgs,
    network: NETWORK_MODE,
    postConditions: [postCondition],
    postConditionMode: 'deny',
  });

  return { txId: response.txid };
}

/**
 * Refund an invoice
 */
export async function refundInvoice(params: {
  invoiceId: number;
  refundAmount: bigint;
  reason: string;
  merchantAddress: string;
}): Promise<{ txId: string }> {
  validateStringLength(params.reason, 'Refund reason', CONTRACT_LIMITS.REASON);

  const functionArgs = [
    Cl.uint(params.invoiceId),
    Cl.uint(params.refundAmount),
    Cl.stringUtf8(params.reason),
  ];

  // Post-condition: merchant will send sBTC for refund
  const postCondition = Pc.principal(params.merchantAddress)
    .willSendLte(params.refundAmount)
    .ft(SBTC_CONTRACT_TYPED, SBTC_TOKEN.assetName);

  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'refund-invoice',
    functionArgs,
    network: NETWORK_MODE,
    postConditions: [postCondition],
    postConditionMode: 'deny',
  });

  return { txId: response.txid };
}

/**
 * Cancel an invoice
 */
export async function cancelInvoice(invoiceId: number): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'cancel-invoice',
    functionArgs: [Cl.uint(invoiceId)],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Create a subscription
 */
export async function createSubscription(params: {
  merchantAddress: string;
  name: string;
  amount: bigint;
  intervalBlocks: number;
  subscriberAddress: string;
}): Promise<{ txId: string }> {
  validateStringLength(params.name, 'Subscription name', CONTRACT_LIMITS.SUBSCRIPTION_NAME);

  const functionArgs = [
    Cl.principal(params.merchantAddress),
    Cl.stringUtf8(params.name),
    Cl.uint(params.amount),
    Cl.uint(params.intervalBlocks),
  ];

  // Post-condition for first payment
  const postCondition = Pc.principal(params.subscriberAddress)
    .willSendLte(params.amount)
    .ft(SBTC_CONTRACT_TYPED, SBTC_TOKEN.assetName);

  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'create-subscription',
    functionArgs,
    network: NETWORK_MODE,
    postConditions: [postCondition],
    postConditionMode: 'deny',
  });

  return { txId: response.txid };
}

/**
 * Process subscription payment
 */
export async function processSubscriptionPayment(params: {
  subscriptionId: number;
  amount: bigint;
  subscriberAddress: string;
}): Promise<{ txId: string }> {
  const functionArgs = [Cl.uint(params.subscriptionId)];

  const postCondition = Pc.principal(params.subscriberAddress)
    .willSendLte(params.amount)
    .ft(SBTC_CONTRACT_TYPED, SBTC_TOKEN.assetName);

  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'process-subscription-payment',
    functionArgs,
    network: NETWORK_MODE,
    postConditions: [postCondition],
    postConditionMode: 'deny',
  });

  return { txId: response.txid };
}

/**
 * Pause a subscription
 */
export async function pauseSubscription(subscriptionId: number): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'pause-subscription',
    functionArgs: [Cl.uint(subscriptionId)],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Resume a subscription
 */
export async function resumeSubscription(subscriptionId: number): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'resume-subscription',
    functionArgs: [Cl.uint(subscriptionId)],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: number): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'cancel-subscription',
    functionArgs: [Cl.uint(subscriptionId)],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Pause the contract (owner only)
 */
export async function pauseContract(): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'pause-contract',
    functionArgs: [],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Unpause the contract (owner only)
 */
export async function unpauseContract(): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'unpause-contract',
    functionArgs: [],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Set platform fee (owner only)
 */
export async function setPlatformFee(newFeeBps: number): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'set-platform-fee',
    functionArgs: [Cl.uint(newFeeBps)],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

/**
 * Transfer ownership (owner only)
 */
export async function transferOwnership(newOwner: string): Promise<{ txId: string }> {
  const response = await request('stx_callContract', {
    contract: PAYMENT_CONTRACT_TYPED,
    functionName: 'transfer-ownership',
    functionArgs: [Cl.principal(newOwner)],
    network: NETWORK_MODE,
  });

  return { txId: response.txid };
}

// ============================================
// TRANSACTION MONITORING
// ============================================

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  txId: string,
  maxAttempts = 30,
  intervalMs = 10000
): Promise<{
  status: 'success' | 'failed' | 'pending';
  result?: unknown;
}> {
  const cleanTxId = txId.startsWith('0x') ? txId : `0x${txId}`;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${API_URL}/extended/v1/tx/${cleanTxId}`);
      const data = await response.json();

      if (data.tx_status === 'success') {
        return { status: 'success', result: data.tx_result };
      } else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
        return { status: 'failed', result: data.tx_result };
      }

      // Still pending, wait and retry
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error('Error checking transaction:', error);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { status: 'pending' };
}

/**
 * Get transaction details
 */
export async function getTransaction(txId: string): Promise<unknown> {
  const cleanTxId = txId.startsWith('0x') ? txId : `0x${txId}`;
  const response = await fetch(`${API_URL}/extended/v1/tx/${cleanTxId}`);
  return response.json();
}
