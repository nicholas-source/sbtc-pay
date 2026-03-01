# sBTC Pay

> Trustless, on-chain payment infrastructure for Bitcoin — built on Stacks.

sBTC Pay is a production-ready payment layer that lets merchants, SaaS platforms, and e-commerce businesses accept Bitcoin via sBTC with no custodian, no database, and no intermediary. Every invoice, subscription, refund, and partial payment lives entirely in a Clarity smart contract on Stacks, settling with full Bitcoin finality.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stacks](https://img.shields.io/badge/Built%20on-Stacks-5546FF)](https://stacks.co)
[![Contract](https://img.shields.io/badge/Contract-payment--v3.clar-F7931A)](contracts/payment-v3.clar)
[![Testnet](https://img.shields.io/badge/Deployed-Stacks%20Testnet-10B981)](https://explorer.hiro.so/?chain=testnet)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Contract](#contract)
- [Frontend](#frontend)
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

**Testnet contract:** `STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v3`  
Verifiable on the [Hiro Explorer (testnet)](https://explorer.hiro.so/?chain=testnet).

---

## Features

### Smart Contract (`payment-v3.clar`)

| Feature | Description |
|---|---|
| **Merchant Registry** | On-chain registration with verification flag, webhook URL, and lifetime volume tracking |
| **Invoice Lifecycle** | Create → partial-pay → paid → expire / cancel / refund, with per-invoice expiry windows |
| **Partial Payments** | Multiple installments accumulate toward an invoice total; overpayment protection configurable per invoice |
| **Recurring Subscriptions** | On-chain billing at configurable block intervals with pause, resume, and cancel — no off-chain cron jobs |
| **Refund System** | Partial or full refunds issued by merchants; every refund recorded on-chain with a timestamp and audit trail |
| **Enterprise Security** | Emergency contract pause, two-step ownership transfer, 0.5% platform fee collected on every payment |

### Merchant Dashboard (Frontend)

- **Landing page** with pricing, features, and merchant onboarding flow
- **Invoice management** — create, view, filter, export (CSV), and issue refunds
- **Subscription management** — create, pause, resume, and cancel recurring billing plans
- **Analytics dashboard** — revenue charts, activity feed, and real-time stats
- **Customer payment page** — QR code, expiration countdown, and payment confirmation
- **Embeddable payment widget** — drop-in `<script>` tag for third-party websites, no framework dependency
- **Wallet integration** — Leather and Xverse via Stacks Connect

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                        │
│  Landing │ Dashboard │ Invoices │ Subscriptions │ Widget     │
└────────────────────────────┬────────────────────────────────┘
                             │  @stacks/connect + transactions
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               Stacks Blockchain (Bitcoin L2)                 │
│                                                             │
│   payment-v3.clar                                           │
│   ├── Merchant Registry                                     │
│   ├── Invoice Engine   (create / pay / expire / cancel)     │
│   ├── Partial Payments (installment accumulation)           │
│   ├── Subscription Engine (block-interval billing)          │
│   ├── Refund System    (partial + full, on-chain audit)     │
│   └── Security Layer   (pause / ownership transfer / fees)  │
│                                                             │
│   sBTC Token (SIP-010, 1:1 Bitcoin-pegged)                  │
└─────────────────────────────────────────────────────────────┘
                             │  Bitcoin finality
                             ▼
                     Bitcoin Network
```

---

## Contract

The smart contract is located at [`contracts/payment-v3.clar`](contracts/payment-v3.clar) (1,243 lines).

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
| `MIN_INVOICE_AMOUNT` | `1000 sats` | Minimum invoice amount |
| `MAX_INVOICE_AMOUNT` | `100,000,000,000 sats` | Maximum (~1,000 BTC) |
| `MAX_EXPIRY_BLOCKS` | `52,560` | Maximum expiry window (~1 year) |

### Public Functions

- `register-merchant` — register a new merchant on-chain
- `create-invoice` — create a new payment invoice
- `pay-invoice` — pay (or partially pay) an invoice with sBTC
- `cancel-invoice` — cancel an unpaid invoice
- `issue-refund` — merchant issues a partial or full refund
- `create-subscription` — create a recurring billing subscription
- `process-subscription-payment` — collect a due subscription payment
- `pause-subscription` / `resume-subscription` / `cancel-subscription`
- `pause-contract` / `resume-contract` — emergency contract controls (owner only)
- `initiate-ownership-transfer` / `accept-ownership-transfer` — two-step ownership handover

---

## Frontend

The frontend is a React + TypeScript + Vite application located in [`frontend/`](frontend/).

### Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/dashboard` | Merchant dashboard (stats, activity feed) |
| `/dashboard/invoices` | Invoice management |
| `/dashboard/subscriptions` | Subscription management |
| `/dashboard/refunds` | Refund history |
| `/dashboard/settings` | Merchant settings |
| `/pay/:invoiceId` | Customer-facing payment page |
| `/widget` | Embeddable widget preview |
| `/admin` | Platform admin panel |

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

# Run unit tests
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

Tests are located in [`tests/payment.test.ts`](tests/payment.test.ts) and use the Clarinet SDK with Vitest.

```bash
# Run all contract tests
npm test

# Run tests with coverage report
npm run test:report

# Watch mode — re-runs on every contract or test change
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

A testnet deployment plan is provided at [`deployments/v3-only.testnet-plan.yaml`](deployments/v3-only.testnet-plan.yaml).

```bash
# Deploy to Stacks testnet
npx ts-node scripts/deploy-testnet.ts
```

**Live testnet contract:** `STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v3`

### Frontend — Vercel

The repository includes a [`vercel.json`](vercel.json) configuration for one-command deployment.

```bash
# From the frontend directory
vercel deploy --prod
```

All routes are configured as SPA fallbacks — no server-side routing required.

---

## Project Structure

```
sbtc-pay/
├── contracts/
│   └── payment-v3.clar          # Clarity smart contract (1,243 lines)
├── deployments/
│   ├── default.simnet-plan.yaml
│   ├── default.testnet-plan.yaml
│   └── v3-only.testnet-plan.yaml
├── scripts/
│   ├── deploy-testnet.ts
│   ├── fund-customer.ts
│   ├── test-v3.ts
│   └── test-v3-advanced.ts
├── tests/
│   └── payment.test.ts          # Contract unit tests
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── dashboard/       # Dashboard-specific components
│   │   │   ├── invoice/         # Invoice components
│   │   │   ├── landing/         # Landing page sections
│   │   │   ├── pay/             # Payment page components
│   │   │   ├── subscription/    # Subscription components
│   │   │   └── ui/              # shadcn/ui primitives
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/
│   │   │   ├── stacks/          # Stacks contract bindings
│   │   │   ├── constants.ts
│   │   │   └── utils.ts
│   │   ├── pages/               # Route-level page components
│   │   └── stores/              # Zustand state stores
│   └── package.json
├── docs/
│   ├── FRONTEND_PRD.md          # Frontend product requirements
│   └── GRANT_APPLICATION.md     # Stacks Endowment grant application
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
| Language | [Clarity](https://docs.stacks.co/clarity) |
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
| Animations | [Framer Motion](https://www.framer.motion.com/) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| Data fetching | [TanStack Query](https://tanstack.com/query) |
| Wallet | [Stacks Connect](https://connect.stacks.js.org/) (Leather + Xverse) |
| Deployment | [Vercel](https://vercel.com/) |

---

## Roadmap

- [x] Smart contract (`payment-v3.clar`) deployed on Stacks testnet
- [x] Full merchant dashboard (invoices, subscriptions, refunds, analytics)
- [x] Customer-facing payment page with QR code and countdown
- [x] Embeddable payment widget
- [x] Wallet integration (Leather + Xverse)
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
