;; title: sBTC Pay - Multi-Token Payment Widget
;; version: 6.0.0
;; summary: Production-ready sBTC + STX payment solution for merchants
;; description: Complete payment infrastructure with invoices, refunds,
;;              subscriptions, partial payments, and enterprise security features.
;;              v6 adds native STX support alongside sBTC.
;;              Built for Stacks Endowment Grant - Getting Started Track
;;
;; NEW in v6 (from v5):
;; - [FEATURE] STX payment support: pay-invoice-stx, pay-merchant-direct-stx,
;;             refund-invoice-stx, create-subscription-stx, process-subscription-payment-stx
;; - [FEATURE] Token type tracking on invoices, subscriptions, refunds
;; - [FEATURE] Per-token volume/fee statistics
;; - [FEATURE] All events include token-type field for chainhook disambiguation
;;
;; PRIOR SECURITY FIXES (carried from v5):
;; - [CRITICAL] Admin-suspended: prevents self-reactivation after admin suspension
;; - [CRITICAL] Cancel-invoice: blocks cancellation when partial payments exist
;; - [HIGH] Close-expired-invoice: anyone can mark expired invoices on-chain
;; - [HIGH] Symmetric fee cap: fee changes limited both up AND down
;; - [HIGH] Reactivate merchant: works even when contract is paused
;; - [MEDIUM] Refund window: tracks first-payment-at for partial payment refund window
;; - [MEDIUM] Update-invoice: enforces MAX_EXPIRY_BLOCKS on new expiry
;; - [CRITICAL] Self-transfer guard: skip fee transfer when payer == fee-recipient
;; - [CRITICAL] CEI pattern: update state BEFORE external calls
;; - [HIGH] Fee change cap: max +100 BPS per change

;; =============================================
;; CONSTANTS
;; =============================================

;; sBTC token contract (TESTNET - change for mainnet)
(define-constant SBTC_CONTRACT 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token)

;; Token type identifiers
(define-constant TOKEN_SBTC u0)
(define-constant TOKEN_STX u1)

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
(define-constant ERR_CANCEL_HAS_PAYMENTS (err u3009))
(define-constant ERR_INVOICE_NOT_EXPIRED (err u3010))
;; [v6] Token mismatch: paying sBTC invoice with STX or vice versa
(define-constant ERR_TOKEN_MISMATCH (err u3011))

;; Error codes - Payment
(define-constant ERR_TRANSFER_FAILED (err u4001))
(define-constant ERR_INSUFFICIENT_PAYMENT (err u4002))
(define-constant ERR_OVERPAYMENT (err u4003))
(define-constant ERR_REFUND_EXCEEDS_PAID (err u4004))
(define-constant ERR_ALREADY_REFUNDED (err u4005))
(define-constant ERR_NO_REFUND_AVAILABLE (err u4006))
(define-constant ERR_REFUND_WINDOW_EXPIRED (err u4007))

;; Error codes - Subscription
(define-constant ERR_SUBSCRIPTION_NOT_FOUND (err u5001))
(define-constant ERR_SUBSCRIPTION_INACTIVE (err u5002))
(define-constant ERR_SUBSCRIPTION_EXISTS (err u5003))
(define-constant ERR_NOT_DUE_YET (err u5004))

;; Error codes - Admin
(define-constant ERR_FEE_CHANGE_TOO_LARGE (err u6001))

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
(define-constant MIN_INVOICE_AMOUNT u1000)   ;; 1000 base units minimum (sats or microSTX)
(define-constant MAX_INVOICE_AMOUNT u100000000000) ;; max in base units
(define-constant MAX_EXPIRY_BLOCKS u52560)   ;; ~1 year max expiry
(define-constant MAX_FEE_BPS_CHANGE u100)    ;; Max 1% change per update
(define-constant REFUND_WINDOW_BLOCKS u4320) ;; ~30 days refund window

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

;; Statistics - sBTC (token-type u0)
(define-data-var total-volume-sbtc uint u0)
(define-data-var total-fees-collected-sbtc uint u0)
(define-data-var total-refunds-sbtc uint u0)

;; Statistics - STX (token-type u1)
(define-data-var total-volume-stx uint u0)
(define-data-var total-fees-collected-stx uint u0)
(define-data-var total-refunds-stx uint u0)

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
    total-received-sbtc: uint,
    total-refunded-sbtc: uint,
    total-received-stx: uint,
    total-refunded-stx: uint,
    invoice-count: uint,
    subscription-count: uint,
    registered-at: uint,
    is-active: bool,
    is-verified: bool,
    admin-suspended: bool
  }
)

;; Invoice storage with partial payment support and token type
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
    refunded-at: (optional uint),
    first-payment-at: (optional uint),
    token-type: uint
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

;; Subscription plans with token type
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
    next-payment-at: uint,
    token-type: uint
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
    processed-at: uint,
    token-type: uint
  }
)

(define-data-var refund-counter uint u0)

;; =============================================
;; PRIVATE HELPER FUNCTIONS
;; =============================================

;; Calculate platform fee (minimum 1 unit if amount > 0)
(define-private (calculate-fee (amount uint))
  (let ((fee (/ (* amount (var-get platform-fee-bps)) BPS_DENOMINATOR)))
    (if (and (> amount u0) (is-eq fee u0) (> (var-get platform-fee-bps) u0))
      u1
      fee
    )
  )
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

;; Absolute difference for symmetric fee cap
(define-private (abs-diff (a uint) (b uint))
  (if (>= a b) (- a b) (- b a))
)

;; Safe sBTC fee transfer: skips if amount is 0 or sender == recipient
(define-private (safe-fee-transfer-sbtc (fee uint) (sender principal))
  (begin
    (if (and (> fee u0) (not (is-eq sender (var-get fee-recipient))))
      (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
        fee
        sender
        (var-get fee-recipient)
        none
      ))
      true
    )
    (ok true)
  )
)

;; Safe STX fee transfer: skips if amount is 0 or sender == recipient
(define-private (safe-fee-transfer-stx (fee uint) (sender principal))
  (begin
    (if (and (> fee u0) (not (is-eq sender (var-get fee-recipient))))
      (try! (stx-transfer? fee sender (var-get fee-recipient)))
      true
    )
    (ok true)
  )
)

;; Update volume stats for sBTC
(define-private (update-stats-sbtc (amount uint) (fee uint))
  (begin
    (var-set total-volume-sbtc (+ (var-get total-volume-sbtc) amount))
    (var-set total-fees-collected-sbtc (+ (var-get total-fees-collected-sbtc) fee))
  )
)

;; Update volume stats for STX
(define-private (update-stats-stx (amount uint) (fee uint))
  (begin
    (var-set total-volume-stx (+ (var-get total-volume-stx) amount))
    (var-set total-fees-collected-stx (+ (var-get total-fees-collected-stx) fee))
  )
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
    (try! (check-is-operational))
    (asserts! (is-none (map-get? merchants caller)) ERR_MERCHANT_EXISTS)

    (map-set merchants caller {
      id: new-id,
      name: name,
      description: description,
      webhook-url: webhook-url,
      logo-url: logo-url,
      total-received-sbtc: u0,
      total-refunded-sbtc: u0,
      total-received-stx: u0,
      total-refunded-stx: u0,
      invoice-count: u0,
      subscription-count: u0,
      registered-at: burn-block-height,
      is-active: true,
      is-verified: false,
      admin-suspended: false
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

    (print {
      event: "merchant-updated",
      merchant: caller,
      name: name,
      description: description,
      webhook-url: webhook-url,
      logo-url: logo-url
    })
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

;; Reactivate merchant (self) - blocked when admin-suspended
(define-public (reactivate-merchant)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants caller) ERR_MERCHANT_NOT_FOUND))
  )
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (map-set merchants caller (merge merchant { is-active: true }))
    (print { event: "merchant-reactivated", merchant: caller })
    (ok true)
  )
)

;; =============================================
;; INVOICE MANAGEMENT
;; =============================================

;; Create invoice - token-type u0 = sBTC, u1 = STX
(define-public (create-invoice
  (amount uint)
  (memo (string-utf8 256))
  (reference-id (optional (string-utf8 64)))
  (expires-in-blocks uint)
  (allow-partial bool)
  (allow-overpay bool)
  (token-type uint)
)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants caller) ERR_MERCHANT_NOT_FOUND))
    (new-id (+ (var-get invoice-counter) u1))
    (expiry (+ burn-block-height expires-in-blocks))
  )
    (try! (check-is-operational))
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    (asserts! (<= amount MAX_INVOICE_AMOUNT) ERR_AMOUNT_TOO_HIGH)
    (asserts! (<= expires-in-blocks MAX_EXPIRY_BLOCKS) ERR_INVALID_AMOUNT)
    ;; Validate token type
    (asserts! (or (is-eq token-type TOKEN_SBTC) (is-eq token-type TOKEN_STX)) ERR_INVALID_AMOUNT)

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
      refunded-at: none,
      first-payment-at: none,
      token-type: token-type
    })

    (map-set invoice-payment-count new-id u0)

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
      token-type: token-type,
      block-height: burn-block-height
    })

    (ok new-id)
  )
)

;; Simple invoice creation (sBTC, backwards compatible)
(define-public (create-simple-invoice
  (amount uint)
  (memo (string-utf8 256))
  (expires-in-blocks uint)
)
  (create-invoice amount memo none expires-in-blocks false false TOKEN_SBTC)
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
    (asserts! (is-eq caller (get merchant invoice)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq (get status invoice) STATUS_PENDING) ERR_INVOICE_NOT_PAYABLE)
    (asserts! (is-eq (get amount-paid invoice) u0) ERR_INVOICE_ALREADY_PAID)
    (asserts! (>= new-amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    (asserts! (<= new-amount MAX_INVOICE_AMOUNT) ERR_AMOUNT_TOO_HIGH)
    (asserts! (<= new-expires-in-blocks MAX_EXPIRY_BLOCKS) ERR_INVALID_AMOUNT)

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

;; Cancel invoice - blocked if partial payments exist
(define-public (cancel-invoice (invoice-id uint))
  (let (
    (caller tx-sender)
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
  )
    (asserts! (is-eq caller (get merchant invoice)) ERR_NOT_AUTHORIZED)
    (asserts! (or
      (is-eq (get status invoice) STATUS_PENDING)
      (is-eq (get status invoice) STATUS_PARTIAL)
    ) ERR_INVOICE_ALREADY_PAID)
    (asserts! (is-eq (get amount-paid invoice) u0) ERR_CANCEL_HAS_PAYMENTS)

    (map-set invoices invoice-id (merge invoice { status: STATUS_CANCELLED }))
    (print { event: "invoice-cancelled", invoice-id: invoice-id })
    (ok true)
  )
)

;; Close expired invoice - anyone can call
(define-public (close-expired-invoice (invoice-id uint))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
  )
    (asserts! (or
      (is-eq (get status invoice) STATUS_PENDING)
      (is-eq (get status invoice) STATUS_PARTIAL)
    ) ERR_INVOICE_NOT_PAYABLE)
    (asserts! (is-invoice-expired (get expires-at invoice)) ERR_INVOICE_NOT_EXPIRED)

    (map-set invoices invoice-id (merge invoice { status: STATUS_EXPIRED }))

    (print {
      event: "invoice-expired",
      invoice-id: invoice-id,
      merchant: (get merchant invoice),
      amount-paid: (get amount-paid invoice),
      amount: (get amount invoice),
      token-type: (get token-type invoice),
      closed-by: tx-sender,
      block-height: burn-block-height
    })
    (ok true)
  )
)

;; =============================================
;; PAYMENT FUNCTIONS - sBTC
;; =============================================

;; Pay invoice with sBTC (supports partial payments)
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
    ;; Must be sBTC invoice
    (asserts! (is-eq (get token-type invoice) TOKEN_SBTC) ERR_TOKEN_MISMATCH)
    (asserts! (or
      (is-eq (get status invoice) STATUS_PENDING)
      (is-eq (get status invoice) STATUS_PARTIAL)
    ) ERR_INVOICE_NOT_PAYABLE)
    (asserts! (not (is-invoice-expired (get expires-at invoice))) ERR_INVOICE_EXPIRED)
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (or (get allow-overpay invoice) (<= amount remaining)) ERR_OVERPAYMENT)
    (asserts! (or (get allow-partial invoice) (>= amount remaining)) ERR_INSUFFICIENT_PAYMENT)

    (let (
      (actual-payment (if (get allow-overpay invoice) amount (if (> amount remaining) remaining amount)))
      (fee (calculate-fee actual-payment))
      (merchant-amount (- actual-payment fee))
      (new-total-paid (+ already-paid actual-payment))
      (new-status (if (>= new-total-paid invoice-amount) STATUS_PAID STATUS_PARTIAL))
      (is-first-payment (is-eq already-paid u0))
    )
      ;; EFFECTS FIRST (CEI pattern)
      (map-set invoice-payments
        { invoice-id: invoice-id, payment-index: payment-count }
        { payer: caller, amount: actual-payment, block-height: burn-block-height }
      )
      (map-set invoice-payment-count invoice-id (+ payment-count u1))

      (map-set invoices invoice-id (merge invoice {
        amount-paid: new-total-paid,
        status: new-status,
        payer: (some caller),
        paid-at: (if (is-eq new-status STATUS_PAID) (some burn-block-height) (get paid-at invoice)),
        first-payment-at: (if is-first-payment (some burn-block-height) (get first-payment-at invoice))
      }))

      (map-set merchants merchant-addr (merge merchant {
        total-received-sbtc: (+ (get total-received-sbtc merchant) merchant-amount)
      }))

      (update-stats-sbtc actual-payment fee)

      ;; INTERACTIONS AFTER (CEI pattern)
      (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
        merchant-amount caller merchant-addr none
      ))
      (try! (safe-fee-transfer-sbtc fee caller))

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
        token-type: TOKEN_SBTC,
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

;; Pay exact invoice amount (sBTC)
(define-public (pay-invoice-exact (invoice-id uint))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (remaining (safe-sub (get amount invoice) (get amount-paid invoice)))
  )
    (pay-invoice invoice-id remaining)
  )
)

;; =============================================
;; PAYMENT FUNCTIONS - STX
;; =============================================

;; Pay invoice with STX (supports partial payments)
(define-public (pay-invoice-stx (invoice-id uint) (amount uint))
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
    ;; Must be STX invoice
    (asserts! (is-eq (get token-type invoice) TOKEN_STX) ERR_TOKEN_MISMATCH)
    (asserts! (or
      (is-eq (get status invoice) STATUS_PENDING)
      (is-eq (get status invoice) STATUS_PARTIAL)
    ) ERR_INVOICE_NOT_PAYABLE)
    (asserts! (not (is-invoice-expired (get expires-at invoice))) ERR_INVOICE_EXPIRED)
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (or (get allow-overpay invoice) (<= amount remaining)) ERR_OVERPAYMENT)
    (asserts! (or (get allow-partial invoice) (>= amount remaining)) ERR_INSUFFICIENT_PAYMENT)

    (let (
      (actual-payment (if (get allow-overpay invoice) amount (if (> amount remaining) remaining amount)))
      (fee (calculate-fee actual-payment))
      (merchant-amount (- actual-payment fee))
      (new-total-paid (+ already-paid actual-payment))
      (new-status (if (>= new-total-paid invoice-amount) STATUS_PAID STATUS_PARTIAL))
      (is-first-payment (is-eq already-paid u0))
    )
      ;; EFFECTS FIRST (CEI pattern)
      (map-set invoice-payments
        { invoice-id: invoice-id, payment-index: payment-count }
        { payer: caller, amount: actual-payment, block-height: burn-block-height }
      )
      (map-set invoice-payment-count invoice-id (+ payment-count u1))

      (map-set invoices invoice-id (merge invoice {
        amount-paid: new-total-paid,
        status: new-status,
        payer: (some caller),
        paid-at: (if (is-eq new-status STATUS_PAID) (some burn-block-height) (get paid-at invoice)),
        first-payment-at: (if is-first-payment (some burn-block-height) (get first-payment-at invoice))
      }))

      (map-set merchants merchant-addr (merge merchant {
        total-received-stx: (+ (get total-received-stx merchant) merchant-amount)
      }))

      (update-stats-stx actual-payment fee)

      ;; INTERACTIONS AFTER (CEI pattern) - stx-transfer? for native STX
      (try! (stx-transfer? merchant-amount caller merchant-addr))
      (try! (safe-fee-transfer-stx fee caller))

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
        token-type: TOKEN_STX,
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

;; Pay exact invoice amount (STX)
(define-public (pay-invoice-exact-stx (invoice-id uint))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (remaining (safe-sub (get amount invoice) (get amount-paid invoice)))
  )
    (pay-invoice-stx invoice-id remaining)
  )
)

;; =============================================
;; DIRECT PAYMENT - sBTC
;; =============================================

(define-public (pay-merchant-direct (merchant-addr principal) (amount uint) (memo (string-utf8 256)))
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (fee (calculate-fee amount))
    (merchant-amount (- amount fee))
  )
    (try! (check-is-operational))
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)

    ;; EFFECTS
    (map-set merchants merchant-addr (merge merchant {
      total-received-sbtc: (+ (get total-received-sbtc merchant) merchant-amount)
    }))
    (update-stats-sbtc amount fee)

    ;; INTERACTIONS
    (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
      merchant-amount caller merchant-addr none
    ))
    (try! (safe-fee-transfer-sbtc fee caller))

    (print {
      event: "direct-payment",
      payer: caller,
      merchant: merchant-addr,
      amount: amount,
      fee: fee,
      merchant-received: merchant-amount,
      memo: memo,
      token-type: TOKEN_SBTC,
      block-height: burn-block-height
    })

    (ok { amount-paid: amount, fee-paid: fee, merchant-received: merchant-amount })
  )
)

;; =============================================
;; DIRECT PAYMENT - STX
;; =============================================

(define-public (pay-merchant-direct-stx (merchant-addr principal) (amount uint) (memo (string-utf8 256)))
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (fee (calculate-fee amount))
    (merchant-amount (- amount fee))
  )
    (try! (check-is-operational))
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)

    ;; EFFECTS
    (map-set merchants merchant-addr (merge merchant {
      total-received-stx: (+ (get total-received-stx merchant) merchant-amount)
    }))
    (update-stats-stx amount fee)

    ;; INTERACTIONS - native STX transfer
    (try! (stx-transfer? merchant-amount caller merchant-addr))
    (try! (safe-fee-transfer-stx fee caller))

    (print {
      event: "direct-payment",
      payer: caller,
      merchant: merchant-addr,
      amount: amount,
      fee: fee,
      merchant-received: merchant-amount,
      memo: memo,
      token-type: TOKEN_STX,
      block-height: burn-block-height
    })

    (ok { amount-paid: amount, fee-paid: fee, merchant-received: merchant-amount })
  )
)

;; =============================================
;; REFUND FUNCTIONS - sBTC
;; =============================================

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
    ;; Must be sBTC invoice
    (asserts! (is-eq (get token-type invoice) TOKEN_SBTC) ERR_TOKEN_MISMATCH)
    (asserts! (is-eq caller merchant-addr) ERR_NOT_AUTHORIZED)
    (asserts! (> amount-paid u0) ERR_NO_REFUND_AVAILABLE)
    (asserts! (< (- burn-block-height (default-to burn-block-height (get first-payment-at invoice)))
                 REFUND_WINDOW_BLOCKS)
      ERR_REFUND_WINDOW_EXPIRED)
    (asserts! (<= refund-amount (safe-sub amount-paid already-refunded)) ERR_REFUND_EXCEEDS_PAID)
    (asserts! (> refund-amount u0) ERR_INVALID_AMOUNT)

    ;; EFFECTS
    (map-set refunds refund-id {
      invoice-id: invoice-id,
      merchant: merchant-addr,
      customer: customer,
      amount: refund-amount,
      reason: reason,
      processed-at: burn-block-height,
      token-type: TOKEN_SBTC
    })
    (var-set refund-counter refund-id)

    (let (
      (new-refunded (+ already-refunded refund-amount))
      (new-status (if (>= new-refunded amount-paid) STATUS_REFUNDED (get status invoice)))
    )
      (map-set invoices invoice-id (merge invoice {
        amount-refunded: new-refunded,
        status: new-status,
        refunded-at: (some burn-block-height)
      }))

      (map-set merchants merchant-addr (merge merchant {
        total-refunded-sbtc: (+ (get total-refunded-sbtc merchant) refund-amount)
      }))
      (var-set total-refunds-sbtc (+ (var-get total-refunds-sbtc) refund-amount))

      ;; INTERACTIONS
      (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
        refund-amount caller customer none
      ))

      (print {
        event: "refund-processed",
        refund-id: refund-id,
        invoice-id: invoice-id,
        merchant: merchant-addr,
        customer: customer,
        amount: refund-amount,
        reason: reason,
        token-type: TOKEN_SBTC,
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

;; Full refund (sBTC)
(define-public (refund-invoice-full (invoice-id uint) (reason (string-utf8 256)))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (refundable (safe-sub (get amount-paid invoice) (get amount-refunded invoice)))
  )
    (refund-invoice invoice-id refundable reason)
  )
)

;; =============================================
;; REFUND FUNCTIONS - STX
;; =============================================

(define-public (refund-invoice-stx (invoice-id uint) (refund-amount uint) (reason (string-utf8 256)))
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
    ;; Must be STX invoice
    (asserts! (is-eq (get token-type invoice) TOKEN_STX) ERR_TOKEN_MISMATCH)
    (asserts! (is-eq caller merchant-addr) ERR_NOT_AUTHORIZED)
    (asserts! (> amount-paid u0) ERR_NO_REFUND_AVAILABLE)
    (asserts! (< (- burn-block-height (default-to burn-block-height (get first-payment-at invoice)))
                 REFUND_WINDOW_BLOCKS)
      ERR_REFUND_WINDOW_EXPIRED)
    (asserts! (<= refund-amount (safe-sub amount-paid already-refunded)) ERR_REFUND_EXCEEDS_PAID)
    (asserts! (> refund-amount u0) ERR_INVALID_AMOUNT)

    ;; EFFECTS
    (map-set refunds refund-id {
      invoice-id: invoice-id,
      merchant: merchant-addr,
      customer: customer,
      amount: refund-amount,
      reason: reason,
      processed-at: burn-block-height,
      token-type: TOKEN_STX
    })
    (var-set refund-counter refund-id)

    (let (
      (new-refunded (+ already-refunded refund-amount))
      (new-status (if (>= new-refunded amount-paid) STATUS_REFUNDED (get status invoice)))
    )
      (map-set invoices invoice-id (merge invoice {
        amount-refunded: new-refunded,
        status: new-status,
        refunded-at: (some burn-block-height)
      }))

      (map-set merchants merchant-addr (merge merchant {
        total-refunded-stx: (+ (get total-refunded-stx merchant) refund-amount)
      }))
      (var-set total-refunds-stx (+ (var-get total-refunds-stx) refund-amount))

      ;; INTERACTIONS - native STX transfer
      (try! (stx-transfer? refund-amount caller customer))

      (print {
        event: "refund-processed",
        refund-id: refund-id,
        invoice-id: invoice-id,
        merchant: merchant-addr,
        customer: customer,
        amount: refund-amount,
        reason: reason,
        token-type: TOKEN_STX,
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

;; Full refund (STX)
(define-public (refund-invoice-full-stx (invoice-id uint) (reason (string-utf8 256)))
  (let (
    (invoice (unwrap! (map-get? invoices invoice-id) ERR_INVOICE_NOT_FOUND))
    (refundable (safe-sub (get amount-paid invoice) (get amount-refunded invoice)))
  )
    (refund-invoice-stx invoice-id refundable reason)
  )
)

;; =============================================
;; SUBSCRIPTION MANAGEMENT - sBTC
;; =============================================

(define-public (create-subscription
  (merchant-addr principal)
  (name (string-utf8 64))
  (amount uint)
  (interval-blocks uint)
)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (new-id (+ (var-get subscription-counter) u1))
  )
    (try! (check-is-operational))
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    (asserts! (>= interval-blocks u144) ERR_INVALID_AMOUNT)

    (map-set subscriptions new-id {
      id: new-id,
      merchant: merchant-addr,
      subscriber: caller,
      name: name,
      amount: amount,
      interval-blocks: interval-blocks,
      status: SUB_ACTIVE,
      payments-made: u0,
      total-paid: u0,
      created-at: burn-block-height,
      last-payment-at: u0,
      next-payment-at: burn-block-height,
      token-type: TOKEN_SBTC
    })

    (map-set merchants merchant-addr (merge merchant {
      subscription-count: (+ (get subscription-count merchant) u1)
    }))

    (var-set subscription-counter new-id)

    (print {
      event: "subscription-created",
      subscription-id: new-id,
      merchant: merchant-addr,
      subscriber: caller,
      name: name,
      amount: amount,
      interval-blocks: interval-blocks,
      token-type: TOKEN_SBTC,
      block-height: burn-block-height
    })

    (ok new-id)
  )
)

;; Process subscription payment (sBTC)
(define-public (process-subscription-payment (subscription-id uint))
  (let (
    (caller tx-sender)
    (sub (unwrap! (map-get? subscriptions subscription-id) ERR_SUBSCRIPTION_NOT_FOUND))
    (subscriber (get subscriber sub))
    (merchant-addr (get merchant sub))
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (amount (get amount sub))
    (fee (calculate-fee amount))
    (merchant-amount (- amount fee))
  )
    (try! (check-is-operational))
    ;; Must be sBTC subscription
    (asserts! (is-eq (get token-type sub) TOKEN_SBTC) ERR_TOKEN_MISMATCH)
    (asserts! (is-eq caller subscriber) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq (get status sub) SUB_ACTIVE) ERR_SUBSCRIPTION_INACTIVE)
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= burn-block-height (get next-payment-at sub)) ERR_NOT_DUE_YET)

    ;; EFFECTS
    (map-set subscriptions subscription-id (merge sub {
      payments-made: (+ (get payments-made sub) u1),
      total-paid: (+ (get total-paid sub) amount),
      last-payment-at: burn-block-height,
      next-payment-at: (+ burn-block-height (get interval-blocks sub))
    }))

    (map-set merchants merchant-addr (merge merchant {
      total-received-sbtc: (+ (get total-received-sbtc merchant) merchant-amount)
    }))
    (update-stats-sbtc amount fee)

    ;; INTERACTIONS
    (try! (contract-call? 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token transfer
      merchant-amount caller merchant-addr none
    ))
    (try! (safe-fee-transfer-sbtc fee caller))

    (print {
      event: "subscription-payment",
      subscription-id: subscription-id,
      subscriber: caller,
      merchant: merchant-addr,
      amount: amount,
      fee: fee,
      merchant-received: merchant-amount,
      payments-made: (+ (get payments-made sub) u1),
      token-type: TOKEN_SBTC,
      block-height: burn-block-height
    })

    (ok {
      subscription-id: subscription-id,
      amount-paid: amount,
      fee-paid: fee,
      merchant-received: merchant-amount,
      next-payment-at: (+ burn-block-height (get interval-blocks sub))
    })
  )
)

;; =============================================
;; SUBSCRIPTION MANAGEMENT - STX
;; =============================================

(define-public (create-subscription-stx
  (merchant-addr principal)
  (name (string-utf8 64))
  (amount uint)
  (interval-blocks uint)
)
  (let (
    (caller tx-sender)
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (new-id (+ (var-get subscription-counter) u1))
  )
    (try! (check-is-operational))
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= amount MIN_INVOICE_AMOUNT) ERR_AMOUNT_TOO_LOW)
    (asserts! (>= interval-blocks u144) ERR_INVALID_AMOUNT)

    (map-set subscriptions new-id {
      id: new-id,
      merchant: merchant-addr,
      subscriber: caller,
      name: name,
      amount: amount,
      interval-blocks: interval-blocks,
      status: SUB_ACTIVE,
      payments-made: u0,
      total-paid: u0,
      created-at: burn-block-height,
      last-payment-at: u0,
      next-payment-at: burn-block-height,
      token-type: TOKEN_STX
    })

    (map-set merchants merchant-addr (merge merchant {
      subscription-count: (+ (get subscription-count merchant) u1)
    }))

    (var-set subscription-counter new-id)

    (print {
      event: "subscription-created",
      subscription-id: new-id,
      merchant: merchant-addr,
      subscriber: caller,
      name: name,
      amount: amount,
      interval-blocks: interval-blocks,
      token-type: TOKEN_STX,
      block-height: burn-block-height
    })

    (ok new-id)
  )
)

;; Process subscription payment (STX)
(define-public (process-subscription-payment-stx (subscription-id uint))
  (let (
    (caller tx-sender)
    (sub (unwrap! (map-get? subscriptions subscription-id) ERR_SUBSCRIPTION_NOT_FOUND))
    (subscriber (get subscriber sub))
    (merchant-addr (get merchant sub))
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
    (amount (get amount sub))
    (fee (calculate-fee amount))
    (merchant-amount (- amount fee))
  )
    (try! (check-is-operational))
    ;; Must be STX subscription
    (asserts! (is-eq (get token-type sub) TOKEN_STX) ERR_TOKEN_MISMATCH)
    (asserts! (is-eq caller subscriber) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq (get status sub) SUB_ACTIVE) ERR_SUBSCRIPTION_INACTIVE)
    (asserts! (get is-active merchant) ERR_MERCHANT_INACTIVE)
    (asserts! (not (get admin-suspended merchant)) ERR_MERCHANT_SUSPENDED)
    (asserts! (>= burn-block-height (get next-payment-at sub)) ERR_NOT_DUE_YET)

    ;; EFFECTS
    (map-set subscriptions subscription-id (merge sub {
      payments-made: (+ (get payments-made sub) u1),
      total-paid: (+ (get total-paid sub) amount),
      last-payment-at: burn-block-height,
      next-payment-at: (+ burn-block-height (get interval-blocks sub))
    }))

    (map-set merchants merchant-addr (merge merchant {
      total-received-stx: (+ (get total-received-stx merchant) merchant-amount)
    }))
    (update-stats-stx amount fee)

    ;; INTERACTIONS - native STX
    (try! (stx-transfer? merchant-amount caller merchant-addr))
    (try! (safe-fee-transfer-stx fee caller))

    (print {
      event: "subscription-payment",
      subscription-id: subscription-id,
      subscriber: caller,
      merchant: merchant-addr,
      amount: amount,
      fee: fee,
      merchant-received: merchant-amount,
      payments-made: (+ (get payments-made sub) u1),
      token-type: TOKEN_STX,
      block-height: burn-block-height
    })

    (ok {
      subscription-id: subscription-id,
      amount-paid: amount,
      fee-paid: fee,
      merchant-received: merchant-amount,
      next-payment-at: (+ burn-block-height (get interval-blocks sub))
    })
  )
)

;; =============================================
;; SUBSCRIPTION LIFECYCLE (token-agnostic)
;; =============================================

;; Cancel subscription (subscriber or merchant)
(define-public (cancel-subscription (subscription-id uint))
  (let (
    (caller tx-sender)
    (sub (unwrap! (map-get? subscriptions subscription-id) ERR_SUBSCRIPTION_NOT_FOUND))
  )
    (asserts! (or
      (is-eq caller (get subscriber sub))
      (is-eq caller (get merchant sub))
    ) ERR_NOT_AUTHORIZED)

    (map-set subscriptions subscription-id (merge sub { status: SUB_CANCELLED }))

    (print {
      event: "subscription-cancelled",
      subscription-id: subscription-id,
      cancelled-by: caller,
      block-height: burn-block-height
    })
    (ok true)
  )
)

;; Pause subscription
(define-public (pause-subscription (subscription-id uint))
  (let (
    (caller tx-sender)
    (sub (unwrap! (map-get? subscriptions subscription-id) ERR_SUBSCRIPTION_NOT_FOUND))
  )
    (try! (check-is-operational))
    (asserts! (is-eq caller (get subscriber sub)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq (get status sub) SUB_ACTIVE) ERR_SUBSCRIPTION_INACTIVE)

    (map-set subscriptions subscription-id (merge sub { status: SUB_PAUSED }))
    (print { event: "subscription-paused", subscription-id: subscription-id })
    (ok true)
  )
)

;; Resume subscription - respects original interval
(define-public (resume-subscription (subscription-id uint))
  (let (
    (caller tx-sender)
    (sub (unwrap! (map-get? subscriptions subscription-id) ERR_SUBSCRIPTION_NOT_FOUND))
    (proper-next (+ (get last-payment-at sub) (get interval-blocks sub)))
    (next-at (if (>= burn-block-height proper-next) burn-block-height proper-next))
  )
    (try! (check-is-operational))
    (asserts! (is-eq caller (get subscriber sub)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq (get status sub) SUB_PAUSED) ERR_SUBSCRIPTION_INACTIVE)

    (map-set subscriptions subscription-id (merge sub {
      status: SUB_ACTIVE,
      next-payment-at: next-at
    }))
    (print { event: "subscription-resumed", subscription-id: subscription-id })
    (ok true)
  )
)

;; =============================================
;; READ-ONLY FUNCTIONS
;; =============================================

(define-read-only (get-merchant (merchant-addr principal))
  (map-get? merchants merchant-addr)
)

(define-read-only (is-merchant (addr principal))
  (is-some (map-get? merchants addr))
)

(define-read-only (get-invoice (invoice-id uint))
  (map-get? invoices invoice-id)
)

(define-read-only (get-invoice-payment-count (invoice-id uint))
  (default-to u0 (map-get? invoice-payment-count invoice-id))
)

(define-read-only (get-invoice-payment (invoice-id uint) (payment-index uint))
  (map-get? invoice-payments { invoice-id: invoice-id, payment-index: payment-index })
)

(define-read-only (is-invoice-payable (invoice-id uint))
  (match (map-get? invoices invoice-id)
    invoice (and
      (is-operational)
      (or
        (is-eq (get status invoice) STATUS_PENDING)
        (is-eq (get status invoice) STATUS_PARTIAL)
      )
      (not (is-invoice-expired (get expires-at invoice)))
    )
    false
  )
)

(define-read-only (get-invoice-remaining (invoice-id uint))
  (match (map-get? invoices invoice-id)
    invoice (safe-sub (get amount invoice) (get amount-paid invoice))
    u0
  )
)

(define-read-only (get-refundable-amount (invoice-id uint))
  (match (map-get? invoices invoice-id)
    invoice (safe-sub (get amount-paid invoice) (get amount-refunded invoice))
    u0
  )
)

(define-read-only (get-subscription (subscription-id uint))
  (map-get? subscriptions subscription-id)
)

(define-read-only (is-subscription-due (subscription-id uint))
  (match (map-get? subscriptions subscription-id)
    sub (and
      (is-eq (get status sub) SUB_ACTIVE)
      (>= burn-block-height (get next-payment-at sub))
    )
    false
  )
)

(define-read-only (get-refund (refund-id uint))
  (map-get? refunds refund-id)
)

(define-read-only (calculate-payment-breakdown (amount uint))
  (let ((fee (calculate-fee amount)))
    {
      total: amount,
      fee: fee,
      merchant-receives: (- amount fee),
      fee-percentage: (var-get platform-fee-bps)
    }
  )
)

;; Platform stats - combined and per-token
(define-read-only (get-platform-stats)
  {
    total-merchants: (var-get merchant-counter),
    total-invoices: (var-get invoice-counter),
    total-subscriptions: (var-get subscription-counter),
    total-volume-sbtc: (var-get total-volume-sbtc),
    total-fees-collected-sbtc: (var-get total-fees-collected-sbtc),
    total-refunds-sbtc: (var-get total-refunds-sbtc),
    total-volume-stx: (var-get total-volume-stx),
    total-fees-collected-stx: (var-get total-fees-collected-stx),
    total-refunds-stx: (var-get total-refunds-stx),
    is-paused: (var-get contract-paused),
    platform-fee-bps: (var-get platform-fee-bps)
  }
)

(define-read-only (get-contract-config)
  {
    owner: (var-get contract-owner),
    fee-recipient: (var-get fee-recipient),
    platform-fee-bps: (var-get platform-fee-bps),
    min-invoice-amount: MIN_INVOICE_AMOUNT,
    max-invoice-amount: MAX_INVOICE_AMOUNT,
    max-expiry-blocks: MAX_EXPIRY_BLOCKS,
    is-paused: (var-get contract-paused)
  }
)

(define-read-only (get-status-name (status uint))
  (if (is-eq status STATUS_PENDING) "pending"
    (if (is-eq status STATUS_PARTIAL) "partial"
      (if (is-eq status STATUS_PAID) "paid"
        (if (is-eq status STATUS_EXPIRED) "expired"
          (if (is-eq status STATUS_CANCELLED) "cancelled"
            (if (is-eq status STATUS_REFUNDED) "refunded"
              "unknown"
            )
          )
        )
      )
    )
  )
)

;; =============================================
;; ADMIN FUNCTIONS
;; =============================================

(define-public (pause-contract)
  (begin
    (try! (check-is-owner))
    (var-set contract-paused true)
    (print { event: "contract-paused", by: tx-sender, block-height: burn-block-height })
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (try! (check-is-owner))
    (var-set contract-paused false)
    (print { event: "contract-unpaused", by: tx-sender, block-height: burn-block-height })
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (try! (check-is-owner))
    (var-set pending-owner (some new-owner))
    (print {
      event: "ownership-transfer-initiated",
      current-owner: tx-sender,
      pending-owner: new-owner
    })
    (ok true)
  )
)

(define-public (accept-ownership)
  (let (
    (pending (unwrap! (var-get pending-owner) ERR_OWNERSHIP_TRANSFER_PENDING))
  )
    (asserts! (is-eq tx-sender pending) ERR_NOT_AUTHORIZED)
    (var-set contract-owner tx-sender)
    (var-set pending-owner none)
    (print {
      event: "ownership-transferred",
      new-owner: tx-sender,
      block-height: burn-block-height
    })
    (ok true)
  )
)

(define-public (cancel-ownership-transfer)
  (begin
    (try! (check-is-owner))
    (var-set pending-owner none)
    (print { event: "ownership-transfer-cancelled" })
    (ok true)
  )
)

(define-public (set-fee-recipient (new-recipient principal))
  (begin
    (try! (check-is-owner))
    (var-set fee-recipient new-recipient)
    (print { event: "fee-recipient-updated", new-recipient: new-recipient })
    (ok true)
  )
)

;; Update platform fee (max 5%, max 1% change per update, symmetric cap)
(define-public (set-platform-fee (new-fee-bps uint))
  (let (
    (current-fee (var-get platform-fee-bps))
  )
    (try! (check-is-owner))
    (asserts! (<= new-fee-bps u500) ERR_INVALID_AMOUNT)
    (asserts! (<= (abs-diff new-fee-bps current-fee) MAX_FEE_BPS_CHANGE) ERR_FEE_CHANGE_TOO_LARGE)
    (var-set platform-fee-bps new-fee-bps)
    (print { event: "platform-fee-updated", new-fee-bps: new-fee-bps, old-fee-bps: current-fee })
    (ok true)
  )
)

(define-public (verify-merchant (merchant-addr principal))
  (let (
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
  )
    (try! (check-is-owner))
    (map-set merchants merchant-addr (merge merchant { is-verified: true }))
    (print { event: "merchant-verified", merchant: merchant-addr })
    (ok true)
  )
)

;; Suspend merchant - sets admin-suspended flag
(define-public (suspend-merchant (merchant-addr principal))
  (let (
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
  )
    (try! (check-is-owner))
    (map-set merchants merchant-addr (merge merchant {
      is-active: false,
      admin-suspended: true
    }))
    (print { event: "merchant-suspended", merchant: merchant-addr })
    (ok true)
  )
)

;; Unsuspend merchant
(define-public (unsuspend-merchant (merchant-addr principal))
  (let (
    (merchant (unwrap! (map-get? merchants merchant-addr) ERR_MERCHANT_NOT_FOUND))
  )
    (try! (check-is-owner))
    (asserts! (get admin-suspended merchant) ERR_MERCHANT_INACTIVE)
    (map-set merchants merchant-addr (merge merchant { admin-suspended: false }))
    (print { event: "merchant-unsuspended", merchant: merchant-addr })
    (ok true)
  )
)
