import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {

  fetchVirtualAccountFundingCandidates,

  getFlutterwaveFundingReference,

  isFlutterwaveFundingAlreadyRecorded,

  isSuccessfulFlutterwaveStatus,

  processFlutterwaveChargeData,

  transactionBelongsToUserVirtualAccount,

} from "../_shared/flutterwave-virtual-account.ts";

import {

  DEMO_SYNC_FUNDING_AMOUNT,

  isDemoUserEmail,

} from "../_shared/demo-user.ts";

import { processFlutterwaveFunding } from "../_shared/flutterwave-funding.ts";



const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",

};



serve(async (req) => {

  if (req.method === "OPTIONS") {

    return new Response(null, { headers: corsHeaders });

  }



  try {

    const supabase = createClient(

      Deno.env.get("SUPABASE_URL") ?? "",

      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",

    );



    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {

      throw new Error("No authorization header");

    }



    const {

      data: { user },

      error: authError,

    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));



    if (authError || !user) {

      throw new Error("Unauthorized");

    }



    if (isDemoUserEmail(user.email)) {

      const { data: virtualAccount } = await supabase

        .from("virtual_accounts")

        .select("account_number, bank_name, account_name")

        .eq("user_id", user.id)

        .eq("provider", "flutterwave")

        .maybeSingle();



      const demoReference = `DEMO-FLW-SYNC-${Date.now()}`;



      await supabase.from("funding_transactions").insert({

        user_id: user.id,

        amount: DEMO_SYNC_FUNDING_AMOUNT,

        status: "pending",

        reference: demoReference,

        bank_name: virtualAccount?.bank_name || "Flutterwave",

        account_number: virtualAccount?.account_number || null,

        account_name: virtualAccount?.account_name || "DEMO USER",

        api_response: { demo: true, source: "demo_sync_pending" },

      });



      const demoResult = await processFlutterwaveFunding({

        supabase,

        userId: user.id,

        grossAmount: DEMO_SYNC_FUNDING_AMOUNT,

        reference: demoReference,

        bankName: virtualAccount?.bank_name || "Flutterwave",

        accountNumber: virtualAccount?.account_number || null,

        accountName: virtualAccount?.account_name || "DEMO USER",

        apiResponse: { demo: true, source: "demo_sync" },

        waiveFee: true,

      });



      const { data: refreshedProfile } = await supabase

        .from("profiles")

        .select("balance")

        .eq("id", user.id)

        .maybeSingle();



      return new Response(

        JSON.stringify({

          success: true,

          synced: demoResult.alreadyProcessed ? 0 : 1,

          balance: Number(refreshedProfile?.balance || demoResult.finalBalance),

          credited: demoResult.alreadyProcessed ? 0 : DEMO_SYNC_FUNDING_AMOUNT,

          message: demoResult.alreadyProcessed

            ? "Demo transfer already credited. Your balance is up to date."

            : `Demo bank transfer credited. ₦${DEMO_SYNC_FUNDING_AMOUNT.toLocaleString()} added to your wallet.`,

        }),

        { headers: { ...corsHeaders, "Content-Type": "application/json" } },

      );

    }



    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!secretKey) {

      throw new Error("Flutterwave credentials not configured");

    }



    const { data: virtualAccount, error: virtualAccountError } = await supabase

      .from("virtual_accounts")

      .select("account_number, tracking_reference, account_name")

      .eq("user_id", user.id)

      .eq("provider", "flutterwave")

      .maybeSingle();



    if (virtualAccountError) {

      throw virtualAccountError;

    }



    if (!virtualAccount) {

      return new Response(

        JSON.stringify({ success: true, synced: 0, message: "No Flutterwave virtual account found" }),

        { headers: { ...corsHeaders, "Content-Type": "application/json" } },

      );

    }



    const { data: profile } = await supabase

      .from("profiles")

      .select("balance, email")

      .eq("id", user.id)

      .maybeSingle();



    const today = new Date();

    const fromDate = new Date(today);

    fromDate.setDate(fromDate.getDate() - 30);



    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    const customerEmail = String(profile?.email || user.email || "").trim().toLowerCase();



    const transactions = await fetchVirtualAccountFundingCandidates(secretKey, {
      virtualAccount,
      customerEmail,
      fromDate: formatDate(fromDate),
      toDate: formatDate(today),
    }).catch((error) => {
      console.error("fetchVirtualAccountFundingCandidates failed:", error);
      return [] as Awaited<ReturnType<typeof fetchVirtualAccountFundingCandidates>>;
    });



    let syncedCount = 0;

    let latestBalance = Number(profile?.balance || 0);



    for (const transaction of transactions) {

      if (!isSuccessfulFlutterwaveStatus(transaction.status)) {

        continue;

      }



      if (!transactionBelongsToUserVirtualAccount(transaction, virtualAccount, customerEmail)) {

        continue;

      }



      if (await isFlutterwaveFundingAlreadyRecorded(supabase, user.id, transaction)) {

        continue;

      }



      try {

        const outcome = await processFlutterwaveChargeData(

          supabase,

          transaction,

          { source: "sync", knownUserId: user.id },

        );

        if (!outcome.processed) {

          continue;

        }

        if (!outcome.result.alreadyProcessed) {

          syncedCount += 1;

          latestBalance = outcome.result.finalBalance;

        } else {

          latestBalance = outcome.result.finalBalance;

        }

      } catch (error) {

        console.error("Failed to sync Flutterwave transaction:", getFlutterwaveFundingReference(transaction), error);

      }

    }



    if (syncedCount === 0) {

      const { data: refreshedProfile } = await supabase

        .from("profiles")

        .select("balance")

        .eq("id", user.id)

        .maybeSingle();

      latestBalance = Number(refreshedProfile?.balance || latestBalance);

    }



    return new Response(

      JSON.stringify({

        success: true,

        synced: syncedCount,

        balance: latestBalance,

        message: syncedCount > 0

          ? `Wallet credited with ${syncedCount} transfer${syncedCount === 1 ? "" : "s"}.`

          : "No new transfers found yet. If you just paid, wait a moment and try again.",

      }),

      { headers: { ...corsHeaders, "Content-Type": "application/json" } },

    );

  } catch (error) {

    console.error("sync-flutterwave-funding error:", error);

    const message = error instanceof Error ? error.message : "Unable to sync Flutterwave funding";

    return new Response(

      JSON.stringify({ success: false, error: message }),

      {

        status: 400,

        headers: { ...corsHeaders, "Content-Type": "application/json" },

      },

    );

  }

});

