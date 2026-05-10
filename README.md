<div align="center">

# sBTC Pay

**Non-custodial Bitcoin payment infrastructure on Stacks.**

Accept sBTC and STX with Stripe-style ergonomics — invoices, subscriptions, refunds, and embeddable widgets — settled directly on-chain with no custodian in the flow of funds.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on Stacks](https://img.shields.io/badge/Built%20on-Stacks-5546FF)](https://stacks.co)
[![Mainnet](https://img.shields.io/badge/Mainnet-Live-10B981)](https://sbtc-pay.com)
[![Testnet](https://img.shields.io/badge/Testnet-Live-F7931A)](https://testnet.sbtc-pay.com)

[**Live App**](https://sbtc-pay.com)  ·  [**Docs**](https://sbtc-pay.com/docs)  ·  [**Testnet**](https://testnet.sbtc-pay.com)

</div>

---

## What it does

sBTC Pay is a payment platform that lets merchants accept sBTC (1:1 Bitcoin) and STX with the same drop-in ergonomics as Stripe — but with one critical difference: **funds move directly from customer wallet to merchant wallet on-chain.** No third party holds your money. No backend ever sees a private key.

For a customer:

1. Open a payment link or scan a QR code
2. Connect a Stacks wallet (Leather, Xverse)
3. Approve the transaction → funds settle in seconds

For a merchant:

1. Connect a wallet, register an on-chain merchant identity
2. Create invoices, subscriptions, or drop a payment widget on your site
3. Receive sBTC directly. View revenue, refunds, and webhook deliveries in your dashboard

Every action is a verifiable on-chain event. The whole protocol — invoice creation, payment splitting, refund accounting, subscription scheduling — is enforced in a single Clarity contract.

---

## Status

| | Mainnet | Testnet |
|---|---|---|
| Contract | [`SPR54P37AA27XHMMTCDEW4YZFPFJX69162JR5CT4.sbtc-pay`](https://explorer.hiro.so/txid/SPR54P37AA27XHMMTCDEW4YZFPFJX69162JR5CT4.sbtc-pay?chain=mainnet) | [`STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v6`](https://explorer.hiro.so/txid/STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v6?chain=testnet) |
| Frontend | [sbtc-pay.com](https://sbtc-pay.com) | [testnet.sbtc-pay.com](https://testnet.sbtc-pay.com) |
| Docs | [sbtc-pay.com/docs](https://sbtc-pay.com/docs) | — |
| Indexer | Live (Chainhook → Supabase) | Live |
| Webhooks | HMAC-signed, retry-queued | HMAC-signed, retry-queued |

This project is funded by a [Stacks Endowment](https://stacks.org) "Getting Started" grant.

---

## Architecture

sBTC Pay is intentionally structured as three layers, each with one job. This separation is the reason the platform is fast, observable, and upgrade-safe.

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3 — Experience                                     │
│  React + Vite SPA. Dashboard, customer portal, widgets,   │
│  payment pages. Talks to wallets via @stacks/connect.     │
└──────────────────────────────────────────────────────────┘
                           ▲ queries indexed data
                           │
┌──────────────────────────────────────────────────────────┐
│  Layer 2 — Indexing                                       │
│  Chainhook predicate → Supabase Edge Function webhook.    │
│  Transforms on-chain events into queryable Postgres rows. │
│  DLQ, idempotent upserts, rollback handling, outbound     │
│  HMAC-signed merchant webhooks with retry queue.          │
└──────────────────────────────────────────────────────────┘
                           ▲ listens to contract events
                           │
┌──────────────────────────────────────────────────────────┐
│  Layer 1 — Truth                                          │
│  Clarity contract on Stacks. Source of truth for all      │
│  money movement. Non-custodial — never holds funds.       │
└──────────────────────────────────────────────────────────┘
                           ▲ Bitcoin finality
                           │
                      Bitcoin Network
```

This is the same pattern Uniswap, Lido, and Aave use: chain for truth, indexer for queries, frontend for experience. See [docs/architecture](https://sbtc-pay.com/docs/architecture) for a deeper write-up.

---

## Features

### Smart contract

| Capability | Notes |
|---|---|
| Merchant registry | On-chain identity with profile, verification flag, suspension, lifetime volume |
| Invoices | Create → partial-pay → paid → expire / cancel / refund. Per-invoice expiry, reference IDs, partial/overpay flags |
| Direct payments | One-shot transfers without an invoice |
| Subscriptions | Burn-block-interval billing with pause/resume/cancel — no off-chain cron required |
| Refunds | Partial or full, bounded refund window, on-chain audit trail |
| Multi-token | sBTC and STX, selected per-invoice / per-subscription |
| Platform fee | 0.5% (50 BPS), atomic split, max ±1% rate-limited per update, 5% hard ceiling |
| Admin controls | Emergency pause, two-step ownership transfer, fee recipient management, merchant moderation |

### Merchant dashboard

- Invoice management with CSV export
- Subscription analytics, pause/resume/cancel
- Refund history and audit trail
- Embeddable widget generator (direct, invoice, subscription)
- **Webhook Delivery** — HMAC-signed outbound webhooks with regenerate-secret + send-test + delivery log
- On-chain merchant profile (name, description, logo, webhook URL)
- Real-time revenue and volume charts

### Customer experience

- Public pay-by-link page with QR code
- Customer portal: payment history, active subscriptions, manual subscription payments
- Embeddable widgets for any site (one-line iframe)
- Live BTC/USD pricing

### Platform admin

- Contract pause / unpause
- Fee rate management (with rate-limit guards)
- Ownership transfer (two-step)
- Merchant verification and moderation
- Indexer health monitoring (heartbeat-based)
- Platform analytics across all merchants

---

## Repository layout

```
sbtc-pay/
├── contracts/                      Clarity smart contract
│   ├── payment-v6.clar             Testnet contract
│   └── sbtc-pay-mainnet.clar       Mainnet contract (same logic, mainnet config)
├── deployments/                    Clarinet deployment plans
├── chainhook/predicates/           Hiro Chainhook predicate definitions
├── supabase/
│   ├── migrations/                 Database schema migrations (014)
│   └── functions/
│       ├── chainhook-webhook/      Indexes contract events into Postgres
│       ├── merchant-webhook-sender HMAC-signs and delivers outbound webhooks
│       ├── merchant-webhook-admin  Per-merchant webhook config (regenerate, test)
│       ├── reconcile/              On-chain → DB cache reconciliation
│       └── wallet-auth/            Stacks signature → Supabase JWT
├── frontend/
│   └── src/
│       ├── pages/                  Routes (dashboard, pay, widget, admin, docs)
│       ├── components/             UI building blocks (shadcn/ui based)
│       ├── stores/                 Zustand stores (wallet, invoice, merchant, admin)
│       └── lib/                    Contract wrappers, Supabase client, utils
├── tests/                          Clarinet/Vitest contract tests
├── scripts/                        Deployment + utility scripts
├── docs/                           Internal design documents
└── README.md
```

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (frontend package manager)
- [Clarinet](https://github.com/hirosystems/clarinet) 2+ (for contract development)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for backend development)
- A Stacks wallet: [Leather](https://leather.io) or [Xverse](https://www.xverse.app)

### Frontend (most common)

```bash
git clone https://github.com/nicholas-source/sbtc-pay.git
cd sbtc-pay/frontend
pnpm install

# Default — points at testnet
pnpm dev

# Or, point at mainnet locally for debugging:
pnpm dev -- --mode mainnet
```

Dev server runs at `http://localhost:5173`.

### Smart contract development

```bash
cd sbtc-pay
npm install

clarinet check              # Static analysis
clarinet console            # Interactive simnet
npm test                    # Run the contract test suite
```

### Backend (Supabase)

```bash
cd sbtc-pay
supabase link --project-ref <your-project-ref>
supabase db push            # Apply migrations
supabase functions deploy chainhook-webhook
supabase functions deploy merchant-webhook-sender --no-verify-jwt
supabase functions deploy merchant-webhook-admin
```

Required edge function secrets:

| Secret | Purpose |
|---|---|
| `JWT_SIGNING_SECRET` | Used by `wallet-auth` to sign Supabase-compatible JWTs (HS256) |
| `INTERNAL_WEBHOOK_TOKEN` | Authenticates `chainhook-webhook` → `merchant-webhook-sender` calls |
| `CHAINHOOK_AUTH_TOKEN` | Verifies inbound Chainhook deliveries |

Set with `supabase secrets set KEY=value --project-ref <ref>`.

---

## How the webhook system works

When a contract event hits the indexer:

1. `chainhook-webhook` writes the event to `events` (idempotent upsert on `tx_id, event_type`)
2. The event handler updates derived tables (`invoices`, `payments`, `subscriptions`, etc.)
3. `chainhook-webhook` fires a fire-and-forget call to `merchant-webhook-sender`
4. `merchant-webhook-sender` looks up the merchant's webhook URL + signing secret, builds the payload, HMAC-SHA256 signs it, and POSTs
5. On success → status `delivered`. On failure → exponential-backoff retry (1m → 5m → 30m → 2h → dead)
6. A `pg_cron` job retries pending deliveries every minute, independent of new events

Merchants verify webhook authenticity using the standard Stripe-style scheme — `t=<timestamp>,v1=<hex>` in the `X-SbtcPay-Signature` header. See [docs/notifications](https://sbtc-pay.com/docs/notifications) for the full integration guide.

---

## Tech stack

| Layer | Technology |
|---|---|
| Smart contract | [Clarity](https://docs.stacks.co/clarity) on [Stacks](https://stacks.co), audited locally with [Clarinet](https://github.com/hirosystems/clarinet) |
| Asset | [sBTC](https://docs.stacks.co/concepts/sbtc) (SIP-010, Bitcoin-pegged) and STX |
| Indexer | [Chainhook](https://docs.hiro.so/chainhook) → [Supabase Edge Function](https://supabase.com/docs/guides/functions) (Deno) |
| Database | [Supabase](https://supabase.com) (Postgres + RLS + pg_cron + pg_net) |
| Frontend | [React 18](https://react.dev) + [TypeScript](https://www.typescriptlang.org) + [Vite](https://vitejs.dev) |
| UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) + [Framer Motion](https://www.framer.com/motion) |
| State | [Zustand](https://zustand-demo.pmnd.rs) |
| Wallets | [`@stacks/connect`](https://connect.stacks.js.org) (Leather, Xverse) |
| Auth | Wallet signature → Supabase HS256 JWT (custom edge function) |
| Hosting | [Vercel](https://vercel.com) (frontend) + Supabase (backend) |

---

## Roadmap

### Shipped

- [x] Clarity contract (`payment-v6` / `sbtc-pay`) deployed on testnet and mainnet
- [x] Production frontend on `sbtc-pay.com` and `testnet.sbtc-pay.com`
- [x] Three-layer architecture (contract + Chainhook indexer + React frontend)
- [x] Full merchant dashboard (invoices, subscriptions, refunds, analytics)
- [x] Customer portal (payment history, subscription management)
- [x] Embeddable widgets (direct, invoice, subscription)
- [x] Wallet provider detection + switch (Leather, Xverse)
- [x] Public payment pages with QR codes
- [x] Outbound merchant webhooks with HMAC signing + retry queue
- [x] Indexer heartbeat + health monitoring
- [x] Documentation site at [sbtc-pay.com/docs](https://sbtc-pay.com/docs)
- [x] Custom domain (`sbtc-pay.com`)
- [x] Platform admin panel (contract controls, fees, ownership, moderation)

### In progress

- [ ] First cohort of beta merchants on mainnet
- [ ] Third-party security audit
- [ ] Public widget loader script (in addition to iframe embeds)
- [ ] Email notifications (currently webhook-only)
- [ ] Merchant API (REST) for programmatic invoice creation

### Planned

- [ ] Standalone mobile-optimized payment flow
- [ ] Recurring revenue analytics
- [ ] Multi-merchant team accounts
- [ ] Integration libraries for common backends (Node, Python, Go)

---

## Contributing

Contributions are welcome. Open an issue first if you're proposing a non-trivial change so we can align on direction before you spend time.

```bash
git checkout -b feat/your-feature
# ... your changes ...
git push origin feat/your-feature
# Open a PR
```

For contract changes specifically: please include `clarinet check` output and add or update tests in `tests/`.

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

Built by [Nicholas Ekpenyong](https://github.com/nicholas-source) · Funded by the [Stacks Endowment](https://stacks.org) · Settled on [Bitcoin](https://bitcoin.org)

</div>
