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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", userId)
      .single();

    if (profileError || profile?.balance === undefined || profile?.balance === null) {
      throw new Error("User profile not found");
    }

    startingBalance = Number(profile.balance) || 0;
  }

  if (startingBalance < debitAmount) {
    throw new Error("Insufficient balance");
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({ balance: startingBalance - debitAmount })
    .eq("id", userId)
    .select("balance")
    .single();

  if (updateError) {
    console.error("Failed to update wallet balance:", updateError);
    throw new Error("Failed to update wallet balance");
  }

  if (!updatedProfile || updatedProfile.balance === undefined || updatedProfile.balance === null) {
    throw new Error("Unable to fetch updated wallet balance");
  }

  const balanceAfter = Number(updatedProfile.balance) || 0;
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

  const { error: transactionError } = await supabase
    .from("user_transactions")
    .insert(transactionPayload);

  if (transactionError) {
    console.error("Failed to record user transaction:", transactionError);
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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", userId)
      .single();

    if (profileError || profile?.balance === undefined || profile?.balance === null) {
      throw new Error("User profile not found");
    }

    startingBalance = Number(profile.balance) || 0;
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({ balance: startingBalance + creditAmount })
    .eq("id", userId)
    .select("balance")
    .single();

  if (updateError) {
    console.error("Failed to update wallet balance:", updateError);
    throw new Error("Failed to update wallet balance");
  }

  if (!updatedProfile || updatedProfile.balance === undefined || updatedProfile.balance === null) {
    throw new Error("Unable to fetch updated wallet balance");
  }

  const balanceAfter = Number(updatedProfile.balance) || 0;
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

  const { error: transactionError } = await supabase
    .from("user_transactions")
    .insert(transactionPayload);

  if (transactionError) {
    console.error("Failed to record user transaction:", transactionError);
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

