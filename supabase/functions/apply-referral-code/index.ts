import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { creditUserWallet } from "../_shared/wallet.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApplyReferralPayload = {
  referral_code?: string | null;
  referred_user_id?: string | null;
  referred_email?: string | null;
  referred_phone?: string | null;
};

const normalize = (value?: string | null) => {
  if (!value) return "";
  return value.trim();
};

const sanitizePhone = (value?: string | null) => {
  const cleaned = value ? value.replace(/[^0-9]/g, "") : "";
  return cleaned || null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const payload = (await req.json()) as ApplyReferralPayload;
    const referralCodeRaw = normalize(payload.referral_code);
    const referredUserId = normalize(payload.referred_user_id);
    const referredEmail = normalize(payload.referred_email); // may be empty
    const referredPhone = sanitizePhone(payload.referred_phone);

    if (!referralCodeRaw) {
      return new Response(
        JSON.stringify({ success: false, error: "Referral code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!referredUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Referred user id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedCode = referralCodeRaw.toUpperCase();

    const { data: referrerData, error: referrerError } = await supabase
      .rpc("find_referrer_by_referral_code", { code: normalizedCode });

    if (referrerError) {
      console.error("Error locating referrer:", referrerError);
      throw new Error("Unable to validate referral code");
    }

    const referrerId = referrerData as string | null;

    if (!referrerId) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid referral code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (referrerId === referredUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "You cannot use your own referral code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let finalReferralCode = normalizedCode;

    // Attempt insert with original code first
    let insertResult = await supabase
      .from("referrals")
      .insert({
        referrer_id: referrerId,
        referred_id: referredUserId,
        referral_code: finalReferralCode,
        referred_email: referredEmail || null,
        referred_phone: referredPhone,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (insertResult.error && insertResult.error.code === "23505") {
      // Duplicate referral code, append unique suffix but keep original code as prefix
      finalReferralCode = `${normalizedCode}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      insertResult = await supabase
        .from("referrals")
        .insert({
          referrer_id: referrerId,
          referred_id: referredUserId,
          referral_code: finalReferralCode,
          referred_email: referredEmail || null,
          referred_phone: referredPhone,
          status: "pending",
        })
        .select("id")
        .maybeSingle();
    }

    if (insertResult.error) {
      console.error("Error inserting referral record:", insertResult.error);
      throw new Error(insertResult.error.message || "Failed to record referral");
    }

    const insertedReferralId = (insertResult.data as { id: string } | null)?.id;
    const rewardAmountSetting = Number(Deno.env.get("REFERRAL_REWARD_AMOUNT") ?? "200");
    const rewardAmount = Number.isFinite(rewardAmountSetting) ? rewardAmountSetting : 200;

    if (insertedReferralId) {
      try {
        await creditUserWallet({
          supabase,
          userId: referrerId,
          amount: rewardAmount,
          transactionType: "credit",
          description: `Referral bonus for code: ${normalizedCode}`,
          reference: `REF_BONUS_${finalReferralCode}`,
        });

        const { error: referralUpdateError } = await supabase
          .from("referrals")
          .update({
            reward_amount: rewardAmount,
            referrer_reward_paid: true,
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", insertedReferralId);

        if (referralUpdateError) {
          throw referralUpdateError;
        }
      } catch (rewardError) {
        console.error("Failed to credit referrer:", rewardError);
      }
    }

    // Update user metadata to note referral usage (best effort)
    try {
      await supabase.auth.admin.updateUserById(referredUserId, {
        user_metadata: {
          referred_by: referrerId,
          referral_code_used: normalizedCode,
        },
      });
    } catch (metaError) {
      console.warn("Failed to update user metadata with referral info:", metaError);
      // continue; metadata update failure shouldn't break main flow
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          referrer_id: referrerId,
          referral_code: finalReferralCode,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("apply-referral-code error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
