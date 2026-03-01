;; title: sBTC Pay - Enterprise Payment Widget
;; version: 3.0.0
;; summary: Production-ready sBTC payment solution for merchants
;; description: Complete payment infrastructure with invoices, refunds, 
;;              subscriptions, partial payments, and enterprise security features.
;;              Built for Stacks Endowment Grant - Getting Started Track

;; =============================================
;; TRAITS
;; =============================================

;; SIP-010 Fungible Token Trait (for future multi-token support)
;; (impl-trait .sip-010-trait.sip-010-trait)

;; =============================================
;; CONSTANTS
;; =============================================

;; sBTC token contract (TESTNET - change for mainnet)
(define-constant SBTC_CONTRACT 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)

;; Error codes - Authorization
(define-constant ERR_NOT_AUTHORIZED (err u1001))
(define-constant ERR_CONTRACT_PAUSED (err u1002))
(define-constant ERR_OWNERSHIP_TRANSFER_PENDING (err u1003))

;; Error codes - Merchant
(define-constant ERR_MERCHANT_NOT_FOUND (err u2001))
(define-constant ERR_MERCHANT_EXISTS (err u2002))
(define-constant ERR_MERCHANT_INACTIVE (err u2003))
(define-constant ERR_MERCHANT_SUSPENDED (err u2004))

;; Error codes - Invoice
(define-constant ERR_INVOICE_NOT_FOUND (err u3001))
(define-constant ERR_INVOICE_ALREADY_PAID (err u3002))
(define-constant ERR_INVOICE_EXPIRED (err u3003))
(define-constant ERR_INVOICE_CANCELLED (err u3004))
(define-constant ERR_INVOICE_NOT_PAYABLE (err u3005))
(define-constant ERR_INVALID_AMOUNT (err u3006))
(define-constant ERR_AMOUNT_TOO_LOW (err u3007))
(define-constant ERR_AMOUNT_TOO_HIGH (err u3008))

;; Error codes - Payment
(define-constant ERR_TRANSFER_FAILED (err u4001))
(define-constant ERR_INSUFFICIENT_PAYMENT (err u4002))
(define-constant ERR_OVERPAYMENT (err u4003))
(define-constant ERR_REFUND_EXCEEDS_PAID (err u4004))
(define-constant ERR_ALREADY_REFUNDED (err u4005))
(define-constant ERR_NO_REFUND_AVAILABLE (err u4006))

;; Error codes - Subscription
(define-constant ERR_SUBSCRIPTION_NOT_FOUND (err u5001))
(define-constant ERR_SUBSCRIPTION_INACTIVE (err u5002))
(define-constant ERR_SUBSCRIPTION_EXISTS (err u5003))
(define-constant ERR_NOT_DUE_YET (err u5004))

;; Invoice status
(define-constant STATUS_PENDING u0)
(define-constant STATUS_PARTIAL u1)
(define-constant STATUS_PAID u2)
(define-constant STATUS_EXPIRED u3)
(define-constant STATUS_CANCELLED u4)
(define-constant STATUS_REFUNDED u5)

;; Subscription status
(define-constant SUB_ACTIVE u0)
(define-constant SUB_PAUSED u1)
(define-constant SUB_CANCELLED u2)

;; Platform configuration
(define-constant PLATFORM_FEE_BPS u50)       ;; 0.5% platform fee
(define-constant BPS_DENOMINATOR u10000)
(define-constant MIN_INVOICE_AMOUNT u1000)   ;; 1000 sats minimum
(define-constant MAX_INVOICE_AMOUNT u100000000000) ;; 1000 BTC max
(define-constant MAX_EXPIRY_BLOCKS u52560)   ;; ~1 year max expiry

;; Initial owner
(define-constant DEPLOYER tx-sender)

;; =============================================
;; DATA VARIABLES
;; =============================================

;; Global state
(define-data-var contract-paused bool false)
(define-data-var contract-owner principal DEPLOYER)
(define-data-var pending-owner (optional principal) none)

;; Counters
(define-data-var invoice-counter uint u0)
(define-data-var merchant-counter uint u0)
(define-data-var subscription-counter uint u0)

;; Statistics
(define-data-var total-volume uint u0)
(define-data-var total-fees-collected uint u0)
(define-data-var total-refunds uint u0)

;; Fee configuration
(define-data-var fee-recipient principal DEPLOYER)
(define-data-var platform-fee-bps uint PLATFORM_FEE_BPS)

;; =============================================
;; DATA MAPS
;; =============================================

;; Merchant registry
(define-map merchants
  principal
  {
    id: uint,
    name: (string-utf8 64),
    description: (optional (string-utf8 256)),
    webhook-url: (optional (string-utf8 256)),
    logo-url: (optional (string-utf8 256)),
    total-received: uint,
    total-refunded: uint,
    invoice-count: uint,
    subscription-count: uint,
    registered-at: uint,
    is-active: bool,
    is-verified: bool
  }
)

;; Invoice storage with partial payment support
(define-map invoices
  uint
  {
    merchant: principal,
    amount: uint,
    amount-paid: uint,
    amount-refunded: uint,
    memo: (string-utf8 256),
    reference-id: (optional (string-utf8 64)),
    status: uint,
    payer: (optional principal),
    allow-partial: bool,
    allow-overpay: bool,
    created-at: uint,
    expires-at: uint,
    paid-at: (optional uint),
    refunded-at: (optional uint)
  }
)

;; Invoice payments tracking (for partial payments)
(define-map invoice-payments
  { invoice-id: uint, payment-index: uint }
  {
    payer: principal,
    amount: uint,
    block-height: uint
  }
)

;; Payment count per invoice
(define-map invoice-payment-count
  uint
  uint
)

;; Subscription plans
(define-map subscriptions
  uint
  {
    id: uint,
    merchant: principal,
    subscriber: principal,
    name: (string-utf8 64),
    amount: uint,
    interval-blocks: uint,
    status: uint,
    payments-made: uint,
    total-paid: uint,
    created-at: uint,
    last-payment-at: uint,
    next-payment-at: uint
  }
)

;; Merchant's subscriptions list
(define-map merchant-subscriptions
  principal
  (list 100 uint)
)

;; Subscriber's subscriptions
(define-map subscriber-subscriptions
  principal
  (list 50 uint)
)