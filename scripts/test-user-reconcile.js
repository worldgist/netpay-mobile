import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    let value = line.slice(i + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, i)] = value;
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(url, key);

const mismatches = await supabase.rpc("get_ledger_balance_mismatches", { p_limit: 5 });
console.log("mismatches before:", mismatches.data);

if (mismatches.data?.[0]) {
  const userId = mismatches.data[0].user_id;
  const detail = await supabase.rpc("get_user_balance_reconcile_detail", { p_user_id: userId });
  console.log("detail:", detail.data);

  const sync = await supabase.rpc("sync_user_profile_balance_from_ledger", { p_user_id: userId });
  console.log("sync:", sync.data);

  const summary = await supabase.rpc("get_ledger_balance_summary");
  console.log("summary after:", summary.data);
}
