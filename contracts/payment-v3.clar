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