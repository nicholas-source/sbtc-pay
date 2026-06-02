;; mock-sbtc-token.clar - Simnet-only SIP-010 mock for refund/payment tests.
;;
;; NOT FOR MAINNET DEPLOYMENT. This contract exposes a public `mint` so any
;; test wallet can grant itself a balance, which is exactly what we don't
;; want in production. The mainnet sBTC token gates minting behind the sBTC
;; deposit bridge; this mock skips that check so simnet tests can stage
;; balances before exercising the sbtc-pay refund and payment flows.
;;
;; The interface (transfer signature, return shapes) is byte-identical to
;; SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token so that the
;; sbtc-pay-test.clar contract - which substitutes this mock for the real
;; sBTC reference - exercises the exact same contract-call? code paths.

(define-fungible-token mock-sbtc)

;; Test-only mint. Any caller can grant any amount to any recipient. The
;; real sBTC token's protocol-mint requires the sbtc-deposit bridge as
;; tx-sender, which can't be simulated cleanly in simnet.
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? mock-sbtc amount recipient)
)

;; SIP-010 transfer - same signature and behaviour as the real sBTC token.
;; Asserts tx-sender matches sender to prevent third-party transfers; the
;; real sBTC token does the same.
(define-public (transfer
  (amount uint)
  (sender principal)
  (recipient principal)
  (memo (optional (buff 34)))
)
  (begin
    (asserts! (is-eq tx-sender sender) (err u4))
    (try! (ft-transfer? mock-sbtc amount sender recipient))
    (match memo m (print m) 0x)
    (ok true)
  )
)

;; SIP-010 read-only surface
(define-read-only (get-name)        (ok "Mock sBTC"))
(define-read-only (get-symbol)      (ok "msBTC"))
(define-read-only (get-decimals)    (ok u8))
(define-read-only (get-balance (account principal))
  (ok (ft-get-balance mock-sbtc account))
)
(define-read-only (get-total-supply)
  (ok (ft-get-supply mock-sbtc))
)
(define-read-only (get-token-uri) (ok none))
