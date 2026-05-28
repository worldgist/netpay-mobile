export type SmeplugBalanceResult = {
  balance: number | null;
  raw: unknown;
};

export const parseSmeplugBalance = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const nested =
    data.data && typeof data.data === "object" && data.data !== null
      ? (data.data as Record<string, unknown>)
      : undefined;

  const candidates = [
    data.balance,
    data.wallet_balance,
    data.available_balance,
    data.wallet,
    nested?.balance,
    nested?.wallet_balance,
    nested?.available_balance,
    nested?.wallet,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const parsed = Number.parseFloat(String(candidate).replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

export const fetchSmeplugWalletBalance = async (secretKey: string): Promise<SmeplugBalanceResult> => {
  try {
    const balanceResponse = await fetch("https://smeplug.ng/api/v1/account/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const balanceData = await balanceResponse.json();
    if (!balanceResponse.ok) {
      console.error("SMEPLUG balance API error:", balanceData);
      return { balance: null, raw: balanceData };
    }

    return { balance: parseSmeplugBalance(balanceData), raw: balanceData };
  } catch (error) {
    console.error("Failed to fetch SMEPLUG wallet balance:", error);
    return { balance: null, raw: null };
  }
};
