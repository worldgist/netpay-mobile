import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const DEMO_USER_EMAIL = "demo@netppay.com";

export const DEMO_FLUTTERWAVE_VIRTUAL_ACCOUNT = {
  business_id: "flutterwave",
  bank_code: "FLW",
  bank_name: "Flutterwave",
  account_number: "8923456789",
  account_name: "DEMO USER",
  tracking_reference: "netpay-demo-flw-001",
  provider: "flutterwave",
  nin: "12345678901",
} as const;

export const DEMO_PENDING_FUNDING_REFERENCE = "DEMO-FLW-FUNDING-PENDING";
export const DEMO_PENDING_FUNDING_AMOUNT = 50000;
export const DEMO_SYNC_FUNDING_AMOUNT = 50000;

type DemoFundingSeed = {
  reference: string;
  amount: number;
  status: "completed" | "pending";
  daysAgo: number;
};

export const DEMO_FUNDING_SEEDS: DemoFundingSeed[] = [
  {
    reference: "DEMO-FLW-FUNDING-001",
    amount: 50000,
    status: "completed",
    daysAgo: 10,
  },
  {
    reference: "DEMO-FLW-FUNDING-002",
    amount: 25000,
    status: "completed",
    daysAgo: 3,
  },
  {
    reference: DEMO_PENDING_FUNDING_REFERENCE,
    amount: DEMO_PENDING_FUNDING_AMOUNT,
    status: "pending",
    daysAgo: 0,
  },
];

export type DemoWalletSeedResult = {
  virtual_account: typeof DEMO_FLUTTERWAVE_VIRTUAL_ACCOUNT;
  funding_records: number;
};

export async function seedDemoVirtualAccountAndFunding(
  supabase: SupabaseClient,
  demoUserId: string,
): Promise<DemoWalletSeedResult> {
  const va = DEMO_FLUTTERWAVE_VIRTUAL_ACCOUNT;

  await supabase
    .from("virtual_accounts")
    .delete()
    .eq("user_id", demoUserId)
    .neq("bank_code", va.bank_code);

  const { error: virtualAccountError } = await supabase.from("virtual_accounts").upsert(
    {
      user_id: demoUserId,
      business_id: va.business_id,
      bank_code: va.bank_code,
      bank_name: va.bank_name,
      account_number: va.account_number,
      account_name: va.account_name,
      tracking_reference: va.tracking_reference,
      provider: va.provider,
      nin: va.nin,
      bvn: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,bank_code" },
  );

  if (virtualAccountError) {
    throw virtualAccountError;
  }

  const { error: ninError } = await supabase.from("user_nin").upsert(
    {
      user_id: demoUserId,
      nin: va.nin,
      provider: "flutterwave",
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (ninError) {
    console.warn("Failed to seed demo user NIN:", ninError);
  }

  await supabase
    .from("funding_transactions")
    .delete()
    .eq("user_id", demoUserId)
    .like("reference", "DEMO-FLW-FUNDING%");

  await supabase
    .from("funding_transactions")
    .delete()
    .eq("user_id", demoUserId)
    .eq("reference", "DEMO-FUNDING-001");

  const now = Date.now();
  const fundingRows = DEMO_FUNDING_SEEDS.map((seed) => ({
    user_id: demoUserId,
    amount: seed.amount,
    status: seed.status,
    reference: seed.reference,
    bank_name: va.bank_name,
    account_number: va.account_number,
    account_name: va.account_name,
    api_response: {
      demo: true,
      provider: "flutterwave",
      source: "demo_seed",
    },
    created_at: new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error: fundingError } = await supabase.from("funding_transactions").insert(fundingRows);
  if (fundingError) {
    throw fundingError;
  }

  return {
    virtual_account: va,
    funding_records: fundingRows.length,
  };
}

export function isDemoUserEmail(email: string | null | undefined): boolean {
  return (email || "").trim().toLowerCase() === DEMO_USER_EMAIL;
}
