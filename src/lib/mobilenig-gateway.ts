/** Deployed MobileNig gateway (function quota — all MobileNig reads route here). */
export const MOBILENIG_GATEWAY_FUNCTION = "fetch-mobilenig-cable-packages";

export const mobilenigActions = {
  balance: { action: "balance" },
  walletHistory: (payload: { page?: number; per_page?: number; trans_id?: string } = {}) => ({
    action: "wallet-history",
    ...payload,
  }),
  dataPlans: (network: string) => ({ action: "data-plans", network }),
  cablePackages: (provider: string) => ({ provider }),
} as const;
