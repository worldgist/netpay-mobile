import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "./push-notifications.ts";

type DebitOptions = {
  supabase: SupabaseClient;
  userId: string;
  amount: number;
  transactionType: string;
  description?: string | null;
  reference?: string;
  performedBy?: string;
  balanceBefore?: number | null;
  notification?: {
    title: string;
    message: string;
    sentBy?: string;
  };
};

export type DebitResult = {
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
};

type LedgerPayload = Record<string, unknown>;

const addLedgerCandidate = (
  candidates: LedgerPayload[],
  payload: LedgerPayload,
) => {
  const serialized = JSON.stringify(payload);
  const exists = candidates.some((candidate) => JSON.stringify(candidate) === serialized);
  if (!exists) {
    candidates.push(payload);
  }
};

const buildLedgerInsertCandidates = (
  basePayload: LedgerPayload,
  fallbackTypes: string[] = [],
): LedgerPayload[] => {
  const candidates: LedgerPayload[] = [];
  addLedgerCandidate(candidates, basePayload);

  const hasPerformedBy = !!basePayload.performed_by;
  if (hasPerformedBy) {
    addLedgerCandidate(candidates, {
      ...basePayload,
      performed_by: null,
    });

    const withoutPerformedBy = { ...basePayload };
    delete withoutPerformedBy.performed_by;
    addLedgerCandidate(candidates, withoutPerformedBy);
  }

  const txType = String(basePayload.transaction_type || "");
  const typesToTry = [
    ...fallbackTypes,
    ...(txType && txType !== "purchase" ? ["purchase"] : []),
  ];

  for (const fallbackType of typesToTry) {
    addLedgerCandidate(candidates, {
      ...basePayload,
      transaction_type: fallbackType,
    });

    if (hasPerformedBy) {
      addLedgerCandidate(candidates, {
        ...basePayload,
        transaction_type: fallbackType,
        performed_by: null,
      });
    }

    const reducedPayload: LedgerPayload = {
      user_id: basePayload.user_id,
      transaction_type: fallbackType,
      amount: basePayload.amount,
      balance_before: basePayload.balance_before,
      balance_after: basePayload.balance_after,
    };
    addLedgerCandidate(candidates, reducedPayload);
  }

  return candidates;
};

const insertUserTransactionWithFallback = async (
  supabase: SupabaseClient,
  payload: LedgerPayload,
  fallbackTypes: string[] = [],
): Promise<{ error: any | null; payloadUsed: LedgerPayload | null }> => {
  const candidates = buildLedgerInsertCandidates(payload, fallbackTypes);
  let lastError: any | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const { error } = await supabase.from("user_transactions").insert(candidate);

    if (!error) {
      if (index > 0) {
        console.warn("user_transactions insert succeeded using fallback payload", {
          originalType: payload.transaction_type,
          usedType: candidate.transaction_type,
          usedPerformedBy: candidate.performed_by,
        });
      }
      return { error: null, payloadUsed: candidate };
    }

    lastError = error;
    console.error("Failed to insert user_transactions candidate", {
      attempt: index + 1,
      totalAttempts: candidates.length,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      candidateType: candidate.transaction_type,
      candidatePerformedBy: candidate.performed_by,
    });
  }

  return { error: lastError, payloadUsed: null };
};

/** Latest balance_after from user_transactions; falls back to profiles.balance. */
export async function getUserLedgerBalance(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data: latestEntry, error: ledgerError } = await supabase
    .from("user_transactions")
    .select("balance_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ledgerError && latestEntry?.balance_after != null) {
    return Number(latestEntry.balance_after) || 0;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .single();

  if (profileError || profile?.balance === undefined || profile?.balance === null) {
    throw new Error("User profile not found");
  }

  return Number(profile.balance) || 0;
}

export const debitUserWallet = async ({
  supabase,
  userId,
  amount,
  transactionType,
  description,
  reference,
  performedBy,
  balanceBefore,
  notification,
}: DebitOptions): Promise<DebitResult> => {
  if (!userId) {
    throw new Error("User ID is required to debit wallet");
  }

  const debitAmount = Number(amount);
  if (!Number.isFinite(debitAmount) || debitAmount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  let startingBalance = balanceBefore ?? null;

  if (startingBalance === null || startingBalance === undefined) {
    startingBalance = await getUserLedgerBalance(supabase, userId);
  }

  if (startingBalance < debitAmount) {
    throw new Error("Insufficient balance");
  }

  const balanceAfter = startingBalance - debitAmount;
  const txReference =
    reference || `DEBIT-${Date.now()}-${userId.replace(/-/g, "").slice(0, 12)}`;

  const transactionPayload: Record<string, unknown> = {
    user_id: userId,
    transaction_type: transactionType,
    amount: debitAmount,
    balance_before: startingBalance,
    balance_after: balanceAfter,
    reference: txReference,
    description: description ?? null,
    performed_by: performedBy ?? userId,
  };

  const { error: transactionError } = await insertUserTransactionWithFallback(
    supabase,
    transactionPayload,
    ["debit", "purchase"],
  );

  if (transactionError) {
    console.error("Failed to record user transaction (debit):", transactionError.message, transactionError);
    throw new Error(
      `Failed to record wallet transaction after debit${
        transactionError?.message
          ? `: ${transactionError.message}`
          : transactionError
            ? `: ${JSON.stringify(transactionError)}`
            : ""
      }`,
    );
  }

  if (notification) {
    try {
      const senderId = notification.sentBy ?? performedBy ?? userId;
      const { data: createdNotification, error: notificationError } = await supabase
        .from("notifications")
        .insert({
          title: notification.title,
          message: notification.message,
          recipient_type: "single",
          recipient_ids: [userId],
          sent_by: senderId,
        })
        .select("id")
        .single();

      if (notificationError) {
        console.error("Failed to create notification record:", notificationError);
      } else if (createdNotification?.id) {
        const { error: recipientError } = await supabase
          .from("notification_recipients")
          .insert({
            notification_id: createdNotification.id,
            user_id: userId,
            is_read: false,
          });

        if (recipientError) {
          console.error("Failed to create notification recipient record:", recipientError);
        }

        // Send push notification to user's device
        await sendPushNotification(
          supabase,
          userId,
          notification.title,
          notification.message,
          {
            type: transactionType,
            reference: txReference,
            amount: debitAmount,
          }
        );
      }
    } catch (notificationException) {
      console.error("Unexpected error while creating notification:", notificationException);
    }
  }

  return {
    balanceBefore: startingBalance,
    balanceAfter,
    reference: txReference,
  };
};

type CreditOptions = {
  supabase: SupabaseClient;
  userId: string;
  amount: number;
  transactionType: string;
  description?: string | null;
  reference?: string;
  performedBy?: string;
  balanceBefore?: number | null;
  notification?: {
    title: string;
    message: string;
    sentBy?: string;
  };
};

export type CreditResult = {
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
};

export const creditUserWallet = async ({
  supabase,
  userId,
  amount,
  transactionType,
  description,
  reference,
  performedBy,
  balanceBefore,
  notification,
}: CreditOptions): Promise<CreditResult> => {
  if (!userId) {
    throw new Error("User ID is required to credit wallet");
  }

  const creditAmount = Number(amount);
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  let startingBalance = balanceBefore ?? null;

  if (startingBalance === null || startingBalance === undefined) {
    startingBalance = await getUserLedgerBalance(supabase, userId);
  }

  const balanceAfter = startingBalance + creditAmount;
  const txReference =
    reference || `CREDIT-${Date.now()}-${userId.replace(/-/g, "").slice(0, 12)}`;

  const transactionPayload: Record<string, unknown> = {
    user_id: userId,
    transaction_type: transactionType,
    amount: creditAmount,
    balance_before: startingBalance,
    balance_after: balanceAfter,
    reference: txReference,
    description: description ?? null,
    performed_by: performedBy ?? userId,
  };

  const { error: transactionError } = await insertUserTransactionWithFallback(
    supabase,
    transactionPayload,
    ["credit", "purchase"],
  );

  if (transactionError) {
    console.error("Failed to record user transaction (credit):", transactionError.message, transactionError);
    throw new Error(
      `Failed to record wallet transaction after credit${
        transactionError?.message
          ? `: ${transactionError.message}`
          : transactionError
            ? `: ${JSON.stringify(transactionError)}`
            : ""
      }`,
    );
  }

  if (notification) {
    try {
      const senderId = notification.sentBy ?? performedBy ?? userId;
      const { data: createdNotification, error: notificationError } = await supabase
        .from("notifications")
        .insert({
          title: notification.title,
          message: notification.message,
          recipient_type: "single",
          recipient_ids: [userId],
          sent_by: senderId,
        })
        .select("id")
        .single();

      if (notificationError) {
        console.error("Failed to create notification record:", notificationError);
      } else if (createdNotification?.id) {
        const { error: recipientError } = await supabase
          .from("notification_recipients")
          .insert({
            notification_id: createdNotification.id,
            user_id: userId,
            is_read: false,
          });

        if (recipientError) {
          console.error("Failed to create notification recipient record:", recipientError);
        }

        // Send push notification to user's device
        await sendPushNotification(
          supabase,
          userId,
          notification.title,
          notification.message,
          {
            type: transactionType,
            reference: txReference,
            amount: creditAmount,
          }
        );
      }
    } catch (notificationException) {
      console.error("Unexpected error while creating notification:", notificationException);
    }
  }

  return {
    balanceBefore: startingBalance,
    balanceAfter,
    reference: txReference,
  };
};

