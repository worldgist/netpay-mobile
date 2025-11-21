#!/usr/bin/env node
/**
 * Quick VTpass purchase test
 *
 * Usage:
 *   SUPABASE_URL=https://xxxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx \
 *   node scripts/test-vtpass.js
 *
 * By default this hits purchase-vtpass-data with the sandbox
 * success number (08011111111) so you can validate end-to-end.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const lagosTimestamp = () => {
  const lagos = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const pad = (value) => `${value}`.padStart(2, "0");
  return (
    lagos.getFullYear().toString() +
    pad(lagos.getMonth() + 1) +
    pad(lagos.getDate()) +
    pad(lagos.getHours()) +
    pad(lagos.getMinutes())
  );
};

const requestId = `${lagosTimestamp()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const payload = {
  phone_number: "08011111111", // VTpass sandbox success number
  plan_id: process.env.TEST_PLAN_ID || "",
  network_name: process.env.TEST_NETWORK_NAME || "MTN",
  request_id: requestId,
};

if (!payload.plan_id) {
  console.error("Set TEST_PLAN_ID to a VTpass plan uuid from data_plans.");
  process.exit(1);
}

(async () => {
  const url = `${SUPABASE_URL}/functions/v1/purchase-vtpass-data`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Body:", text);
})();

