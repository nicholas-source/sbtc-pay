// Launch promotion config. Set `active: false` (or let endDate pass) and
// every promo surface — landing pricing section, FAQ entry, docs Fees
// page — reverts to standard copy.
//
// The on-chain platform fee is independent of this flag. To start the
// promo: call set-platform-fee with 0 (from admin). To end it: call
// set-platform-fee with 50 and flip `active` to false (or simply let
// endDate pass, since isPromoActive() also checks the date).
export const LAUNCH_PROMO = {
  active: true,
  endDate: "2026-07-31",
  endDateDisplay: "July 31, 2026",
} as const;

export const isPromoActive = (): boolean =>
  LAUNCH_PROMO.active && new Date() < new Date(LAUNCH_PROMO.endDate);
