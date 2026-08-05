import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i);
    let value = line.slice(i + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(url, key);

const tests = [];

async function run() {
  const summary = await supabase.rpc("get_ledger_balance_summary");
  tests.push({
    name: "get_ledger_balance_summary",
    ok: !summary.error,
    detail: summary.error?.message || summary.data,
  });

  const mismatches = await supabase.rpc("get_ledger_balance_mismatches", { p_limit: 5 });
  tests.push({
    name: "get_ledger_balance_mismatches",
    ok: !mismatches.error,
    count: Array.isArray(mismatches.data) ? mismatches.data.length : null,
    detail: mismatches.error?.message,
  });

  const { data: profiles } = await supabase.from("profiles").select("id").limit(1);
  if (profiles?.[0]) {
    const bal = await supabase.rpc("get_user_ledger_balance", { p_user_id: profiles[0].id });
    tests.push({
      name: "get_user_ledger_balance",
      ok: !bal.error,
      detail: bal.error?.message || bal.data,
    });
  }

  const statusProbe = await supabase.from("user_transactions").select("id, status").limit(1);
  tests.push({
    name: "user_transactions.status column",
    ok: !!statusProbe.error,
    detail: statusProbe.error?.message || "column exists",
  });

  const joinProbe = await supabase
    .from("user_transactions")
    .select("id, profiles:user_id(full_name, email)")
    .limit(1);
  tests.push({
    name: "profiles join",
    ok: !joinProbe.error,
    detail: joinProbe.error?.message || joinProbe.data?.length || 0,
  });

  const fundingProbe = await supabase
    .from("user_transactions")
    .select("amount")
    .in("transaction_type", ["credit", "wallet_funding", "fund_wallet"])
    .eq("status", "completed")
    .limit(1);
  tests.push({
    name: "treasury funding query with status",
    ok: !!fundingProbe.error,
    detail: fundingProbe.error?.message || "unexpected success",
  });

  console.log(JSON.stringify(tests, null, 2));
  process.exit(tests.every((t) => t.ok || t.name === "user_transactions.status column" || t.name === "treasury funding query with status") ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
