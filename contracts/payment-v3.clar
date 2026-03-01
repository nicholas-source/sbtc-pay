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

;; Refund requests
(define-map refunds
  uint
  {
    invoice-id: uint,
    merchant: principal,
    customer: principal,
    amount: uint,
    reason: (string-utf8 256),
    processed-at: uint
  }
)

(define-data-var refund-counter uint u0)

;; =============================================
;; PRIVATE HELPER FUNCTIONS
;; =============================================

;; Calculate platform fee
(define-private (calculate-fee (amount uint))
  (/ (* amount (var-get platform-fee-bps)) BPS_DENOMINATOR)
)

;; Check if contract is operational
(define-private (is-operational)
  (not (var-get contract-paused))
)

;; Check if invoice expired
(define-private (is-invoice-expired (expires-at uint))
  (> burn-block-height expires-at)
)

;; Check if caller is owner
(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner))
)

;; Safe subtraction (returns 0 if would underflow)
(define-private (safe-sub (a uint) (b uint))
  (if (>= a b) (- a b) u0)
)

;; =============================================
;; AUTHORIZATION CHECKS
;; =============================================

(define-read-only (check-is-owner)
  (ok (asserts! (is-owner) ERR_NOT_AUTHORIZED))
)

(define-read-only (check-is-operational)
  (ok (asserts! (is-operational) ERR_CONTRACT_PAUSED))
)

;; =============================================
;; MERCHANT MANAGEMENT
;; =============================================

;; Register as merchant
(define-public (register-merchant 
  (name (string-utf8 64)) 
  (description (optional (string-utf8 256)))
  (webhook-url (optional (string-utf8 256)))
  (logo-url (optional (string-utf8 256)))
)
  (let (
    (caller tx-sender)
    (new-id (+ (var-get merchant-counter) u1))
  )
    ;; Check contract operational
    (try! (check-is-operational))
    
    ;; Prevent duplicate registration
    (asserts! (is-none (map-get? merchants caller)) ERR_MERCHANT_EXISTS)
    
    ;; Register
    (map-set merchants caller {
      id: new-id,
      name: name,
      description: description,
      webhook-url: webhook-url,
      logo-url: logo-url,
      total-received: u0,
      total-refunded: u0,
      invoice-count: u0,
      subscription-count: u0,
      registered-at: burn-block-height,
      is-active: true,
      is-verified: false
    })
    
    (var-set merchant-counter new-id)
    
    (print {
      event: "merchant-registered",
      merchant: caller,
      id: new-id,
      name: name,
      block-height: burn-block-height
    })
    
    (ok new-id)
  )
)

;; Update merchant profile
(define-public (update-merchant-profile
  (name (string-utf8 64))
  (description (optional (string-utf8 256)))
  (webhook-url (optional (string-utf8 256)))
  (logo-url (optional (string-utf8 256)))
)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants caller) ERR_MERCHANT_NOT_FOUND))
  )
    (try! (check-is-operational))
    
    (map-set merchants caller (merge merchant {
      name: name,
      description: description,
      webhook-url: webhook-url,
      logo-url: logo-url
    }))
    
    (print { event: "merchant-updated", merchant: caller })
    (ok true)
  )
)

;; Deactivate merchant (self)
(define-public (deactivate-merchant)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants caller) ERR_MERCHANT_NOT_FOUND))
  )
    (map-set merchants caller (merge merchant { is-active: false }))
    (print { event: "merchant-deactivated", merchant: caller })
    (ok true)
  )
)

;; Reactivate merchant (self)
(define-public (reactivate-merchant)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants caller) ERR_MERCHANT_NOT_FOUND))
  )
    (try! (check-is-operational))
    (map-set merchants caller (merge merchant { is-active: true }))
    (print { event: "merchant-reactivated", merchant: caller })
    (ok true)
  )
)

;; =============================================
;; INVOICE MANAGEMENT
;; =============================================

;; Create invoice with advanced options
(define-public (create-invoice
  (amount uint)
  (memo (string-utf8 256))
  (reference-id (optional (string-utf8 64)))
  (expires-in-blocks uint)
  (allow-partial bool)
  (allow-overpay bool)
)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants caller) ERR_MERCHANT_NOT_FOUND))
    (new-id (+ (var-get invoice-counter) u1))
    (expiry (+ burn-block-height expires-in-blocks))
  )
    (try! (check-is-operational))
    
    ;; Validate merchant active
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    
    ;; Validate amount bounds
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    (asserts! (<= amount MAX_INVOICE_AMOUNT) ERR_AMOUNT_TOO_HIGH)
    
    ;; Validate expiry
    (asserts! (<= expires-in-blocks MAX_EXPIRY_BLOCKS) ERR_INVALID_AMOUNT)
    
    ;; Create invoice
    (map-set invoices new-id {
      merchant: caller,
      amount: amount,
      amount-paid: u0,
      amount-refunded: u0,
      memo: memo,
      reference-id: reference-id,
      status: STATUS_PENDING,
      payer: none,
      allow-partial: allow-partial,
      allow-overpay: allow-overpay,
      created-at: burn-block-height,
      expires-at: expiry,
      paid-at: none,
      refunded-at: none
    })
    
    ;; Initialize payment count
    (map-set invoice-payment-count new-id u0)
    
    ;; Update merchant stats
    (map-set merchants caller (merge merchant {
      invoice-count: (+ (get invoice-count merchant) u1)
    }))
    
    (var-set invoice-counter new-id)
    
    (print {
      event: "invoice-created",
      invoice-id: new-id,
      merchant: caller,
      amount: amount,
      memo: memo,
      reference-id: reference-id,
      expires-at: expiry,
      allow-partial: allow-partial,
      block-height: burn-block-height
    })
    
    (ok new-id)
  )
)

;; Simple invoice creation (backwards compatible)
(define-public (create-simple-invoice
  (amount uint)
  (memo (string-utf8 256))
  (expires-in-blocks uint)
)
  (create-invoice amount memo none expires-in-blocks false false)
)

;; Update invoice (before any payment)
(define-public (update-invoice
  (invoice-id uint)
  (new-amount uint)
  (new-memo (string-utf8 256))
  (new-expires-in-blocks uint)
)
  (let (
    (caller tx-sender)
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
  )
    (try! (check-is-operational))
    
    ;; Only merchant can update
    (asserts! (is-eq caller (get merchant invoice)) ERR_NOT_AUTHORIZED)
    
    ;; Can only update pending invoices with no payments
    (asserts! (is-eq (get status invoice) STATUS_PENDING) ERR_INVOICE_NOT_PAYABLE)
    (asserts! (is-eq (get amount-paid invoice) u0) ERR_INVOICE_ALREADY_PAID)
    
    ;; Validate new amount
    (asserts! (>= new-amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    (asserts! (<= new-amount MAX_INVOICE_AMOUNT) ERR_AMOUNT_TOO_HIGH)
    
    (map-set invoices invoice-id (merge invoice {
      amount: new-amount,
      memo: new-memo,
      expires-at: (+ burn-block-height new-expires-in-blocks)
    }))
    
    (print {
      event: "invoice-updated",
      invoice-id: invoice-id,
      new-amount: new-amount,
      new-memo: new-memo
    })
    
    (ok true)
  )
)

;; Cancel invoice
(define-public (cancel-invoice (invoice-id uint))
  (let (
    (caller tx-sender)
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
  )
    ;; Only merchant can cancel
    (asserts! (is-eq caller (get merchant invoice)) ERR_NOT_AUTHORIZED)
    
    ;; Can only cancel unpaid invoices
    (asserts! (or 
      (is-eq (get status invoice) STATUS_PENDING)
      (is-eq (get status invoice) STATUS_PARTIAL)
    ) ERR_INVOICE_ALREADY_PAID)
    
    (map-set invoices invoice-id (merge invoice { status: STATUS_CANCELLED }))
    
    (print { event: "invoice-cancelled", invoice-id: invoice-id })
    (ok true)
  )
)

;; =============================================
;; PAYMENT FUNCTIONS
;; =============================================

;; Pay invoice (supports partial payments)
(define-public (pay-invoice (invoice-id uint) (amount uint))
  (let (
    (caller tx-sender)
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (merchant-addr (get merchant invoice))
    (invoice-amount (get amount invoice))
    (already-paid (get amount-paid invoice))
    (remaining (safe-sub invoice-amount already-paid))
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (payment-count (default-to u0 (map-get? invoice-payment-count invoice-id)))
  )
    (try! (check-is-operational))
    
    ;; Validate invoice status
    (asserts! (or 
      (is-eq (get status invoice) STATUS_PENDING)
      (is-eq (get status invoice) STATUS_PARTIAL)
    ) ERR_INVOICE_NOT_PAYABLE)
    
    ;; Check not expired
    (asserts! (not (is-invoice-expired (get expires-at invoice))) ERR_INVOICE_EXPIRED)
    
    ;; Validate amount
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    
    ;; Handle overpayment
    (asserts! (or 
      (get allow-overpay invoice)
      (<= amount remaining)
    ) ERR_OVERPAYMENT)
    
    ;; Handle partial payment
    (asserts! (or 
      (get allow-partial invoice)
      (>= amount remaining)
    ) ERR_INSUFFICIENT_PAYMENT)
    
    ;; Calculate fee and merchant amount
    (let (
      (actual-payment (if (get allow-overpay invoice) amount (if (> amount remaining) remaining amount)))
      (fee (calculate-fee actual-payment))
      (merchant-amount (- actual-payment fee))
      (new-total-paid (+ already-paid actual-payment))
      (new-status (if (>= new-total-paid invoice-amount) STATUS_PAID STATUS_PARTIAL))
    )
      ;; Transfer to merchant
      (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
        merchant-amount
        caller
        merchant-addr
        none
      ))
      
      ;; Transfer fee
      (if (> fee u0)
        (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
          fee
          caller
          (var-get fee-recipient)
          none
        ))
        true
      )
      
      ;; Record payment
      (map-set invoice-payments 
        { invoice-id: invoice-id, payment-index: payment-count }
        { payer: caller, amount: actual-payment, block-height: burn-block-height }
      )
      (map-set invoice-payment-count invoice-id (+ payment-count u1))
      
      ;; Update invoice
      (map-set invoices invoice-id (merge invoice {
        amount-paid: new-total-paid,
        status: new-status,
        payer: (some caller),
        paid-at: (if (is-eq new-status STATUS_PAID) (some burn-block-height) (get paid-at invoice))
      }))
      
      ;; Update merchant stats
      (map-set merchants merchant-addr (merge merchant {
        total-received: (+ (get total-received merchant) merchant-amount)
      }))
      
      ;; Update global stats
      (var-set total-volume (+ (var-get total-volume) actual-payment))
      (var-set total-fees-collected (+ (var-get total-fees-collected) fee))
      
      (print {
        event: "payment-received",
        invoice-id: invoice-id,
        payer: caller,
        merchant: merchant-addr,
        amount: actual-payment,
        fee: fee,
        merchant-received: merchant-amount,
        total-paid: new-total-paid,
        status: new-status,
        block-height: burn-block-height
      })
      
      (ok {
        invoice-id: invoice-id,
        amount-paid: actual-payment,
        fee-paid: fee,
        merchant-received: merchant-amount,
        total-paid: new-total-paid,
        remaining: (safe-sub invoice-amount new-total-paid),
        status: new-status
      })
    )
  )
)

;; Pay exact invoice amount
(define-public (pay-invoice-exact (invoice-id uint))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (remaining (safe-sub (get amount invoice) (get amount-paid invoice)))
  )
    (pay-invoice invoice-id remaining)
  )
)

;; Direct payment to merchant
(define-public (pay-merchant-direct (merchant-addr principal) (amount uint) (memo (string-utf8 256)))
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (fee (calculate-fee amount))
    (merchant-amount (- amount fee))
  )
    (try! (check-is-operational))
    
    ;; Check merchant is active
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    
    ;; Validate amount
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    
    ;; Transfer to merchant
    (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
      merchant-amount
      caller
      merchant-addr
      none
    ))
    
    ;; Transfer fee
    (if (> fee u0)
      (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
        fee
        caller
        (var-get fee-recipient)
        none
      ))
      true
    )
    
    ;; Update stats
    (map-set merchants merchant-addr (merge merchant {
      total-received: (+ (get total-received merchant) merchant-amount)
    }))
    (var-set total-volume (+ (var-get total-volume) amount))
    (var-set total-fees-collected (+ (var-get total-fees-collected) fee))
    
    (print {
      event: "direct-payment",
      payer: caller,
      merchant: merchant-addr,
      amount: amount,
      fee: fee,
      merchant-received: merchant-amount,
      memo: memo,
      block-height: burn-block-height
    })
    
    (ok {
      amount-paid: amount,
      fee-paid: fee,
      merchant-received: merchant-amount
    })
  )
)

;; =============================================
;; REFUND FUNCTIONS
;; =============================================

;; Process refund (merchant initiated)
(define-public (refund-invoice (invoice-id uint) (refund-amount uint) (reason (string-utf8 256)))
  (let (
    (caller tx-sender)
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (merchant-addr (get merchant invoice))
    (customer (unwrap! (get payer invoice) ERR_NO_REFUND_AVAILABLE))
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (already-refunded (get amount-refunded invoice))
    (amount-paid (get amount-paid invoice))
    (refund-id (+ (var-get refund-counter) u1))
  )
    (try! (check-is-operational))
    
    ;; Only merchant can refund
    (asserts! (is-eq caller merchant-addr) ERR_NOT_AUTHORIZED)
    
    ;; Must have payments to refund
    (asserts! (> amount-paid u0) ERR_NO_REFUND_AVAILABLE)
    
    ;; Can't refund more than paid minus already refunded
    (asserts! (<= refund-amount (safe-sub amount-paid already-refunded)) ERR_REFUND_EXCEEDS_PAID)
    
    ;; Validate refund amount
    (asserts! (> refund-amount u0) ERR_INVALID_AMOUNT)
    
    ;; Transfer refund from merchant to customer
    (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
      refund-amount
      caller
      customer
      none
    ))
    
    ;; Record refund
    (map-set refunds refund-id {
      invoice-id: invoice-id,
      merchant: merchant-addr,
      customer: customer,
      amount: refund-amount,
      reason: reason,
      processed-at: burn-block-height
    })
    (var-set refund-counter refund-id)
    
    ;; Update invoice
    (let (
      (new-refunded (+ already-refunded refund-amount))
      (new-status (if (>= new-refunded amount-paid) STATUS_REFUNDED (get status invoice)))
    )
      (map-set invoices invoice-id (merge invoice {
        amount-refunded: new-refunded,
        status: new-status,
        refunded-at: (some burn-block-height)
      }))
      
      ;; Update merchant stats
      (map-set merchants merchant-addr (merge merchant {
        total-refunded: (+ (get total-refunded merchant) refund-amount)
      }))
      
      ;; Update global stats
      (var-set total-refunds (+ (var-get total-refunds) refund-amount))
      
      (print {
        event: "refund-processed",
        refund-id: refund-id,
        invoice-id: invoice-id,
        merchant: merchant-addr,
        customer: customer,
        amount: refund-amount,
        reason: reason,
        block-height: burn-block-height
      })
      
      (ok {
        refund-id: refund-id,
        amount-refunded: refund-amount,
        total-refunded: new-refunded,
        remaining-refundable: (safe-sub amount-paid new-refunded)
      })
    )
  )
)

;; Full refund
(define-public (refund-invoice-full (invoice-id uint) (reason (string-utf8 256)))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (refundable (safe-sub (get amount-paid invoice) (get amount-refunded invoice)))
  )
    (refund-invoice invoice-id refundable reason)
  )
)