# sBTC Pay

> Trustless, on-chain payment infrastructure for Bitcoin — built on Stacks.

sBTC Pay is a production-ready payment layer that lets merchants, SaaS platforms, and e-commerce businesses accept Bitcoin via sBTC with no custodian, no database, and no intermediary. Every invoice, subscription, refund, and partial payment lives entirely in a Clarity smart contract on Stacks, settling with full Bitcoin finality.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stacks](https://img.shields.io/badge/Built%20on-Stacks-5546FF)](https://stacks.co)
[![Contract](https://img.shields.io/badge/Contract-payment--v4.clar-F7931A)](contracts/payment-v4.clar)
[![Testnet](https://img.shields.io/badge/Deployed-Stacks%20Testnet-10B981)](https://explorer.hiro.so/?chain=testnet)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Contract](#contract)
- [Frontend](#frontend)
- [Backend](#backend)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Smart Contract Development](#smart-contract-development)
  - [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The Stacks ecosystem has a powerful primitive in sBTC — Bitcoin that participates in smart contracts — but no ready-made infrastructure for the most fundamental commercial use case: getting paid. sBTC Pay fills that gap.

Unlike Web2-style payment processors wrapped around a blockchain, sBTC Pay enforces all payment logic on-chain. Funds flow **directly** between buyer and merchant. There is no backend server holding state, no custodian holding funds, and no trust assumption beyond the Bitcoin network itself.

**Testnet contract:** [`STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v4`](https://explorer.hiro.so/txid/STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v4?chain=testnet)  
**Live frontend:** [sbtc-pay-phi.vercel.app](https://sbtc-pay-phi.vercel.app)

---

## Features

### Smart Contract (`payment-v4.clar`)

| Feature | Description |
|---|---|
| **Merchant Registry** | On-chain registration with profile (name, description, logo, webhook URL), verification flag, suspension, and lifetime volume tracking |
| **Invoice Lifecycle** | Create → partial-pay → paid → expire / cancel / refund, with per-invoice expiry windows and reference IDs |
| **Partial Payments** | Multiple installments accumulate toward an invoice total; overpayment and underpayment protection configurable per invoice |
| **Recurring Subscriptions** | On-chain billing at configurable block intervals with pause, resume, and cancel — no off-chain cron jobs |
| **Refund System** | Partial or full refunds with 30-day refund window, on-chain audit trail, and per-invoice refund tracking |
| **Direct Payments** | Pay merchants directly without an invoice via `pay-merchant-direct` |
| **Enterprise Security** | Emergency contract pause, two-step ownership transfer, fee recipient management, merchant verification and suspension |
| **Platform Fees** | Configurable fee (default 0.5% BPS) with max-delta rate-limit on changes (±100 BPS per update) |

### Merchant Dashboard (Frontend)

- **Landing page** with pricing, features, and merchant onboarding flow
- **Invoice management** — create, view, filter, export (CSV), and issue refunds
- **Subscription management** — create plans, pause/resume/cancel, analytics chart, CSV export
- **Refund tracking** — searchable refund history with sort-by-date/amount, CSV export
- **Analytics dashboard** — revenue charts, activity feed, command palette, and real-time stats
- **Settings** — on-chain profile management, notification preferences with webhook delivery
- **Customer portal** — payment history and subscription management for end-users
- **Platform admin** — contract pause/unpause, fee management, ownership transfer, merchant verification/suspension
- **Embeddable widgets** — drop-in payment, invoice, and subscription widgets for third-party sites
- **Wallet integration** — Leather and Xverse via Stacks Connect

### Backend (Supabase + Chainhook)

- **Chainhook webhook** — indexes all 16 contract event types into Supabase in real-time
- **Timing-safe auth** — constant-time token comparison prevents timing attacks on webhook endpoint
- **Merchant cache** — `sync_merchant_cache` RPC for fast profile lookups without hitting the chain
- **On-chain reconciliation** — frontend reconciles Supabase cache against chain state on every load

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React Frontend                              │
│  Landing │ Dashboard │ Invoices │ Subscriptions │ Widgets │ Admin    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │  @stacks/connect + transactions
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 Stacks Blockchain (Bitcoin L2)                        │
│                                                                     │
│   payment-v4.clar (1,294 lines, Clarity v4)                         │
│   ├── Merchant Registry     (register / update / deactivate)        │
│   ├── Invoice Engine        (create / pay / update / cancel)        │
│   ├── Partial Payments      (installment accumulation)              │
│   ├── Direct Payments       (pay-merchant-direct)                   │
│   ├── Subscription Engine   (block-interval billing)                │
│   ├── Refund System         (partial + full, 30-day window)         │
│   └── Admin Layer           (pause / ownership / fees / verify)     │
│                                                                     │
│   sBTC Token (SIP-010, 1:1 Bitcoin-pegged)                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │  print events
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│   Chainhook Predicate  ──►  Supabase Edge Function (webhook)        │
│                              ├── Indexes events into Supabase DB    │
│                              ├── Timing-safe auth token             │
│                              └── 16 event type handlers             │
└─────────────────────────────────────────────────────────────────────┘
                       │  Bitcoin finality
                       ▼
                  Bitcoin Network
```

---

## Contract

The smart contract is located at [`contracts/payment-v4.clar`](contracts/payment-v4.clar) (1,294 lines).

### Invoice Status Flow

```
PENDING (0) ──► PARTIAL (1) ──► PAID (2)
    │                               │
    ├──────────────────────────► EXPIRED (3)
    ├──────────────────────────► CANCELLED (4)
    └──────────────────────────► REFUNDED (5)
```

### Subscription Status

```
ACTIVE (0) ◄──► PAUSED (1)
    │
    └──► CANCELLED (2)
```

### Key Constants

| Constant | Value | Description |
|---|---|---|
| `PLATFORM_FEE_BPS` | `50` | 0.5% platform fee on every payment |
| `MIN_INVOICE_AMOUNT` | `1,000 sats` | Minimum invoice amount |
| `MAX_INVOICE_AMOUNT` | `100,000,000,000 sats` | Maximum (~1,000 BTC) |
| `MAX_EXPIRY_BLOCKS` | `52,560` | Maximum expiry window (~1 year) |
| `REFUND_WINDOW_BLOCKS` | `4,320` | Refund window (~30 days) |
| `MAX_FEE_BPS_CHANGE` | `100` | Maximum fee change per update (±1%) |

### Public Functions (24)

**Merchant Management**
- `register-merchant` — register with name, description, webhook URL, logo URL
- `update-merchant-profile` — update merchant profile fields
- `deactivate-merchant` / `reactivate-merchant` — self-service activation toggle

**Invoice Operations**
- `create-invoice` — create invoice with amount, memo, reference ID, expiry, partial/overpay flags
- `create-simple-invoice` — shorthand with defaults (no partial, no overpay)
- `update-invoice` — update pending invoice amount, memo, or expiry
- `cancel-invoice` — cancel an unpaid invoice

**Payments**
- `pay-invoice` — pay (or partially pay) an invoice with sBTC
- `pay-invoice-exact` — pay the exact remaining balance
- `pay-merchant-direct` — direct payment to merchant without an invoice

**Refunds**
- `refund-invoice` — partial refund with amount and reason
- `refund-invoice-full` — full refund of all paid amount

**Subscriptions**
- `create-subscription` — create recurring billing with merchant, label, amount, interval
- `process-subscription-payment` — collect a due subscription payment
- `pause-subscription` / `resume-subscription` / `cancel-subscription`

**Admin (Owner Only)**
- `pause-contract` / `unpause-contract` — emergency contract controls
- `set-platform-fee` — adjust fee with rate-limit protection
- `set-fee-recipient` — change fee collection address
- `transfer-ownership` / `accept-ownership` / `cancel-ownership-transfer` — two-step ownership handover
- `verify-merchant` / `suspend-merchant` — merchant moderation

### Read-Only Functions (16)

`get-merchant` · `is-merchant` · `get-invoice` · `is-invoice-payable` · `get-invoice-remaining` · `get-refundable-amount` · `get-invoice-payment-count` · `calculate-payment-breakdown` · `get-platform-stats` · `get-contract-config` · `get-status-name` · `get-subscription` · `is-subscription-due` · `check-is-owner` · `check-is-operational` · `get-subscription-payment`

---

## Frontend

The frontend is a React + TypeScript + Vite application located in [`frontend/`](frontend/).

### Pages

| Route | Description |
|---|---|
| `/` | Landing page with features, pricing, and onboarding |
| `/dashboard` | Merchant dashboard — stats, revenue chart, activity feed, command palette |
| `/dashboard/invoices` | Invoice management — create, filter, export CSV |
| `/dashboard/subscriptions` | Subscription plans — create, analytics, export CSV |
| `/dashboard/refunds` | Refund history — search, sort, export CSV |
| `/dashboard/settings` | Merchant profile + notification + webhook settings |
| `/pay/:invoiceId` | Customer-facing payment page with QR code and countdown |
| `/customer/payments` | Customer payment history |
| `/customer/subscriptions` | Customer subscription management (pause/resume/cancel) |
| `/widget/:merchantAddress` | Embeddable direct payment widget |
| `/widget/invoice/:invoiceId` | Embeddable invoice payment widget |
| `/widget/subscribe/:merchantAddress` | Embeddable subscription widget |
| `/admin` | Platform admin — pause/unpause, fees, ownership, merchant moderation |

---

## Backend

### Supabase

sBTC Pay uses [Supabase](https://supabase.com/) as a caching and indexing layer. The chain is the source of truth — Supabase provides fast queries, search, and filtering without hitting the blockchain on every page load.

### Chainhook Webhook

A Supabase Edge Function at [`supabase/functions/chainhook-webhook/`](supabase/functions/chainhook-webhook/) receives real-time events from a [Chainhook](https://docs.hiro.so/chainhook) predicate monitoring the payment-v4 contract. It indexes 16 event types:

- Merchant: registered, updated, deactivated, reactivated, verified, suspended
- Invoice: created, cancelled
- Payment: received, direct-payment
- Refund: processed
- Subscription: created, payment, cancelled, paused, resumed

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Clarinet](https://github.com/hirosystems/clarinet) v2+ (for contract development)
- [pnpm](https://pnpm.io/) (frontend package manager)
- A Stacks wallet: [Leather](https://leather.io/) or [Xverse](https://www.xverse.app/)

### Smart Contract Development

```bash
# Clone the repository
git clone https://github.com/nicholas-source/sbtc-pay.git
cd sbtc-pay

# Install contract test dependencies
npm install

# Check the contract for errors
clarinet check

# Start a local Clarinet console (simnet)
clarinet console

# Run unit tests (72 tests — 64 passing, 8 todo pending sBTC token in simnet)
npm test
```

### Frontend Development

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
pnpm install

# Start the development server
pnpm dev

# Build for production
pnpm build

# Preview the production build
pnpm preview
```

The development server starts at `http://localhost:5173`.

---

## Testing

### Contract Tests (Clarinet + Vitest)

Tests are located in [`tests/payment.test.ts`](tests/payment.test.ts) and cover 7 test suites with 72 tests (64 passing, 8 `.todo()` pending sBTC token availability in simnet):

- **Merchant Registration** — register, duplicate prevention, profile update, deactivate/reactivate
- **Invoice Management** — create (advanced + simple), minimum amount, update, cancel, partial payments
- **Payments** — pay invoice, overpayment/underpayment guards, direct payments, minimum amount
- **Refunds** — partial/full refund, authorization, amount validation (todo: requires sBTC tokens)
- **Subscriptions** — create, cancel (subscriber + merchant), pause/resume, interval validation
- **Read-Only Functions** — 15 tests covering all read-only contract functions
- **Admin Functions** — pause/unpause, fee management, ownership transfer, merchant verification/suspension

```bash
# Run all contract tests
npm test

# Run tests with coverage report
npm run test:report

# Watch mode
npm run test:watch
```

### Frontend Tests

```bash
cd frontend
pnpm test
```

---

## Deployment

### Testnet

Deployment plans are provided in [`deployments/`](deployments/).

```bash
# Deploy to Stacks testnet
npx ts-node scripts/deploy-testnet.ts
```

**Live testnet contract:** [`STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v4`](https://explorer.hiro.so/txid/STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v4?chain=testnet)

### Frontend — Vercel

The repository includes a [`vercel.json`](vercel.json) configuration for one-command deployment.

```bash
# From the frontend directory
vercel deploy --prod
```

**Live frontend:** [sbtc-pay-phi.vercel.app](https://sbtc-pay-phi.vercel.app)

All routes are configured as SPA fallbacks — no server-side routing required.

---

## Project Structure

```
sbtc-pay/
├── contracts/
│   └── payment-v4.clar              # Clarity smart contract (1,294 lines)
├── deployments/
│   ├── default.simnet-plan.yaml
│   ├── default.testnet-plan.yaml
│   └── v4-only.testnet-plan.yaml
├── scripts/
│   ├── deploy-testnet.ts
│   ├── fund-customer.ts
│   ├── test-v3.ts
│   └── test-v3-advanced.ts
├── tests/
│   └── payment.test.ts              # Contract tests (72 tests, 7 suites)
├── supabase/
│   └── functions/
│       └── chainhook-webhook/        # Edge function: event indexer
│           └── index.ts
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── dashboard/           # Stats, charts, activity feed, command palette
│   │   │   ├── invoice/             # Invoice table, detail, create dialog, refund
│   │   │   ├── landing/             # Hero, features, pricing, footer, navbar
│   │   │   ├── layout/              # Dashboard + customer layouts, page transitions
│   │   │   ├── pay/                 # Payment page components
│   │   │   ├── settings/            # Notification history
│   │   │   ├── subscription/        # Plan cards, analytics, subscriber table
│   │   │   ├── wallet/              # Wallet connect dialog
│   │   │   └── ui/                  # shadcn/ui primitives
│   │   ├── hooks/                   # use-mobile, use-toast
│   │   ├── lib/
│   │   │   ├── stacks/
│   │   │   │   └── contract.ts      # All contract call wrappers (24 public + 16 read-only)
│   │   │   ├── constants.ts         # sBTC formatting, USD conversion helpers
│   │   │   ├── export-csv.ts        # CSV export utility
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── dashboard/           # Invoices, subscriptions, refunds, settings
│   │   │   ├── customer/            # Payment history, subscription management
│   │   │   ├── pay/                 # Customer-facing payment page
│   │   │   ├── widget/              # Embeddable payment, invoice, subscription widgets
│   │   │   └── admin/               # Platform admin panel
│   │   ├── stores/                  # Zustand stores (wallet, invoice, subscription, merchant, admin, ui, notifications)
│   │   └── test/                    # Frontend unit tests
│   └── package.json
├── docs/
│   ├── FRONTEND_PRD.md              # Frontend product requirements
│   └── GRANT_APPLICATION.md         # Stacks Endowment grant application
├── settings/
│   ├── Devnet.toml
│   ├── Testnet.toml
│   └── Mainnet.toml
├── Clarinet.toml
├── vercel.json
└── README.md
```

---

## Tech Stack

### Smart Contract
| Layer | Technology |
|---|---|
| Language | [Clarity v4](https://docs.stacks.co/clarity) |
| Runtime | [Stacks Blockchain](https://stacks.co) |
| Asset | [sBTC (SIP-010)](https://docs.stacks.co/stacks-101/sbtc) |
| Testing | [Clarinet SDK](https://github.com/hirosystems/clarinet) + [Vitest](https://vitest.dev/) |

### Frontend
| Layer | Technology |
|---|---|
| Framework | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Build tool | [Vite](https://vitejs.dev/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| Animations | [Framer Motion](https://www.framer.com/motion/) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| Wallet | [Stacks Connect](https://connect.stacks.js.org/) (Leather + Xverse) |
| Deployment | [Vercel](https://vercel.com/) |

### Backend
| Layer | Technology |
|---|---|
| Database / Cache | [Supabase](https://supabase.com/) (PostgreSQL + RLS) |
| Event Indexing | [Chainhook](https://docs.hiro.so/chainhook) → Supabase Edge Function |
| Runtime | [Deno](https://deno.land/) (Edge Functions) |

---

## Roadmap

- [x] Smart contract (`payment-v4.clar`) deployed on Stacks testnet
- [x] Full merchant dashboard (invoices, subscriptions, refunds, analytics)
- [x] Customer-facing payment page with QR code and countdown
- [x] Embeddable payment, invoice, and subscription widgets
- [x] Wallet integration (Leather + Xverse)
- [x] Chainhook webhook indexer with timing-safe auth
- [x] Platform admin panel (pause, fees, ownership, merchant moderation)
- [x] Customer portal (payment history, subscription management)
- [x] On-chain data reconciliation (Supabase ↔ chain state)
- [x] Contract test suite (72 tests across 7 suites)
- [ ] Security audit by a Stacks-specialist auditor (CoinFabrik or equivalent)
- [ ] Mainnet contract deployment
- [ ] Live production dashboard on a custom domain
- [ ] Widget published to public CDN
- [ ] Merchant quickstart documentation
- [ ] End-to-end integration test suite against mainnet
- [ ] First cohort of 10 live mainnet merchants onboarded

---

## Contributing

Contributions are welcome. Please open an issue to discuss a proposed change before submitting a pull request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a pull request

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built by <a href="https://github.com/nicholas-source">Nicholas Ekpenyong</a> · Powered by <a href="https://stacks.co">Stacks</a> · Settled on <a href="https://bitcoin.org">Bitcoin</a>
</div>
