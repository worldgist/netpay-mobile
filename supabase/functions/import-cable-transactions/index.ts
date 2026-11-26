import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MobileNigTransaction {
  trans_id: string;
  type: string;
  service: string;
  description: string;
  initial_balance: string;
  amount: string;
  final_balance: string;
  date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Get environment variables
    const MOBILENIG_PUBLIC_KEY = Deno.env.get("MOBILENIG_PUBLIC_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!MOBILENIG_PUBLIC_KEY) {
      return new Response(
        JSON.stringify({ error: "MOBILENIG_PUBLIC_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authentication token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);

    if (roleError || !roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { page = 1, per_page = 100, user_id, auto_match = true } = body;

    // Fetch wallet history from MobileNig
    const walletHistoryUrl = new URL("https://enterprise.mobilenig.com/api/v2/control/wallet_history");
    walletHistoryUrl.searchParams.set("page", String(page));
    walletHistoryUrl.searchParams.set("per_page", String(per_page));

    const walletResponse = await fetch(walletHistoryUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MOBILENIG_PUBLIC_KEY}`,
      },
    });

    if (!walletResponse.ok) {
      const errorText = await walletResponse.text();
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch MobileNig wallet history",
          details: errorText 
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const walletData = await walletResponse.json();

    if (walletData.statusCode !== "200" || walletData.message !== "success") {
      return new Response(
        JSON.stringify({ 
          error: "MobileNig API error",
          details: walletData 
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const transactions: MobileNigTransaction[] = walletData.details || [];
    
    // Filter for cable TV transactions (DSTV, GOTV, Startimes, etc.)
    const cableTransactions = transactions.filter((tx) => {
      const service = tx.service?.toLowerCase() || "";
      const description = tx.description?.toLowerCase() || "";
      return (
        service.includes("dstv") ||
        service.includes("gotv") ||
        service.includes("startimes") ||
        service.includes("showmax") ||
        description.includes("dstv") ||
        description.includes("gotv") ||
        description.includes("startimes") ||
        description.includes("cable")
      );
    });

    console.log(`Found ${cableTransactions.length} cable TV transactions out of ${transactions.length} total`);

    // Get all existing transaction references to avoid duplicates
    const { data: existingTransactions, error: existingError } = await supabase
      .from("user_transactions")
      .select("reference, description")
      .eq("transaction_type", "purchase");

    const existingReferences = new Set(
      (existingTransactions || []).map((tx) => tx.reference).filter(Boolean)
    );

    const importedTransactions = [];
    const skippedTransactions = [];
    const errors = [];

    // Process each cable TV transaction
    for (const tx of cableTransactions) {
      try {
        // Check if transaction already exists
        const reference = `CABLE-${tx.trans_id}`;
        if (existingReferences.has(reference)) {
          skippedTransactions.push({
            trans_id: tx.trans_id,
            reason: "Already exists",
          });
          continue;
        }

        // Parse transaction date
        const txDate = new Date(tx.date);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));

        // Only import transactions from the last 90 days
        if (daysDiff > 90) {
          skippedTransactions.push({
            trans_id: tx.trans_id,
            reason: "Too old (>90 days)",
          });
          continue;
        }

        // Calculate balance before and after
        const amount = parseFloat(tx.amount) || 0;
        const balanceAfter = parseFloat(tx.final_balance) || 0;
        const balanceBefore = parseFloat(tx.initial_balance) || 0;

        // Try to find user by matching trans_id in function logs or by checking reference patterns
        // The reference format is: CABLE-${Date.now()}-${user.id.substring(0, 8)}
        // We can extract the timestamp and try to find users who made purchases around that time
        
        // Extract timestamp from trans_id (if it's numeric and looks like a timestamp)
        const transIdNum = parseInt(tx.trans_id);
        const possibleTimestamp = transIdNum > 1000000000000 ? transIdNum : null;
        
        let matchedUserId: string | null = null;
        
        // Try to find user by checking profiles for users who might have made this purchase
        // We'll search for users who have a balance that matches the transaction pattern
        // or check if we can match by amount and date
        
        // For now, we'll create a transaction record that can be manually assigned
        // But we'll try to match by checking if any user has a reference that matches
        
        // Try multiple matching strategies
        
        // Strategy 1: Check if we can find a user by searching for similar transactions
        // Look for transactions with similar amount within a wider time window (30 minutes)
        const { data: similarTransactions } = await supabase
          .from("user_transactions")
          .select("user_id, reference, amount, created_at, description")
          .eq("transaction_type", "purchase")
          .gte("amount", amount * 0.95) // Within 5% of the amount
          .lte("amount", amount * 1.05)
          .gte("created_at", new Date(txDate.getTime() - 30 * 60 * 1000).toISOString()) // Within 30 minutes
          .lte("created_at", new Date(txDate.getTime() + 30 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(5);

        if (similarTransactions && similarTransactions.length > 0) {
          // Check if any description mentions cable TV
          const cableMatch = similarTransactions.find((st) => 
            st.description?.toLowerCase().includes("cable") ||
            st.description?.toLowerCase().includes("dstv") ||
            st.description?.toLowerCase().includes("gotv") ||
            st.description?.toLowerCase().includes("startimes")
          );
          
          if (cableMatch) {
            matchedUserId = cableMatch.user_id;
          } else {
            // Use the most recent similar transaction
            matchedUserId = similarTransactions[0].user_id;
          }
        }

        // Strategy 2: Try to extract smart card number from description and match with recent cable purchases
        if (!matchedUserId) {
          const cardMatch = tx.description.match(/\d{10,}/);
          if (cardMatch) {
            const smartCard = cardMatch[0];
            // Look for transactions mentioning this smart card
            const { data: cardTransactions } = await supabase
              .from("user_transactions")
              .select("user_id")
              .eq("transaction_type", "purchase")
              .ilike("description", `%${smartCard}%`)
              .gte("created_at", new Date(txDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Within 7 days
              .order("created_at", { ascending: false })
              .limit(1);
            
            if (cardTransactions && cardTransactions.length > 0) {
              matchedUserId = cardTransactions[0].user_id;
            }
          }
        }

        // If user_id is provided in request, use it directly
        const targetUserId = user_id || matchedUserId;

        // If we found a user (either by matching or provided), create the transaction
        if (targetUserId && auto_match) {
          // Get user's current balance to estimate balance_before and balance_after
          const { data: userProfile } = await supabase
            .from("profiles")
            .select("balance")
            .eq("id", targetUserId)
            .single();

          if (userProfile) {
            // Estimate balance_before by adding the amount to current balance
            // This is an approximation since we don't know the exact balance at that time
            const userBalanceAfter = parseFloat(userProfile.balance.toString());
            const userBalanceBefore = userBalanceAfter + amount;

            const { error: insertError } = await supabase
              .from("user_transactions")
              .insert({
                user_id: targetUserId,
                transaction_type: "purchase",
                amount: amount,
                balance_before: userBalanceBefore,
                balance_after: userBalanceAfter,
                description: `Cable TV: ${tx.service} - ${tx.description}`,
                reference: reference,
                performed_by: targetUserId,
                created_at: txDate.toISOString(),
              });

            if (insertError) {
              errors.push({
                trans_id: tx.trans_id,
                error: `Failed to insert: ${insertError.message}`,
              });
            } else {
              importedTransactions.push({
                trans_id: tx.trans_id,
                user_id: targetUserId,
                amount: amount,
                description: tx.description,
                date: tx.date,
                service: tx.service,
                status: "imported",
                reference: reference,
              });
            }
          } else {
            errors.push({
              trans_id: tx.trans_id,
              error: "User profile not found",
            });
          }
        } else {
          // No user match found - add to manual review list
          importedTransactions.push({
            trans_id: tx.trans_id,
            amount: amount,
            description: tx.description,
            date: tx.date,
            service: tx.service,
            status: "needs_manual_assignment",
            reference: reference,
            transaction_data: {
              transaction_type: "purchase",
              amount: amount,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              description: `Cable TV: ${tx.service} - ${tx.description}`,
              reference: reference,
              created_at: txDate.toISOString(),
            },
          });
        }
      } catch (error) {
        errors.push({
          trans_id: tx.trans_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_cable_transactions: cableTransactions.length,
          imported: importedTransactions.length,
          skipped: skippedTransactions.length,
          errors: errors.length,
        },
        imported: importedTransactions,
        skipped: skippedTransactions,
        errors: errors,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error importing cable transactions:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

