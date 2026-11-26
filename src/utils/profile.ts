import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

const NOT_FOUND_CODE = "PGRST116";

const deriveFullName = (user: User): string => {
  const metaName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim().length > 0
      ? user.user_metadata.full_name.trim()
      : undefined;

  if (metaName) return metaName;

  const emailName = user.email?.split("@")[0];
  if (emailName && emailName.trim().length > 0) {
    return emailName.trim();
  }

  return "User";
};

export async function ensureProfileExists(
  user: User | null | undefined,
  overrides?: Partial<ProfileInsert>,
): Promise<ProfileRow | null> {
  if (!user) return null;

  try {
      const { data: existing, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (existing) {
      return existing as ProfileRow;
    }

    if (fetchError && fetchError.code !== NOT_FOUND_CODE) {
      console.warn("ensureProfileExists: unable to fetch profile", fetchError);
      return null;
    }

    const payload: ProfileInsert = {
      id: user.id,
      email: overrides?.email ?? user.email ?? null,
      full_name: overrides?.full_name ?? deriveFullName(user),
      phone:
        overrides?.phone !== undefined
          ? overrides.phone
          : typeof user.user_metadata?.phone === "string"
            ? user.user_metadata.phone
            : null,
      status: overrides?.status ?? "active",
      balance: overrides?.balance ?? 0,
      biometric_enabled: overrides?.biometric_enabled ?? false,
      pin_enabled: overrides?.pin_enabled ?? false,
      referral_code:
        overrides?.referral_code !== undefined
          ? overrides.referral_code
          : typeof user.user_metadata?.referral_code === "string"
            ? user.user_metadata.referral_code
            : null,
    };

      const { data: inserted, error: upsertError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .maybeSingle();

    if (upsertError) {
      console.warn("ensureProfileExists: unable to upsert profile", upsertError);
      return null;
    }

    return inserted as ProfileRow | null;
  } catch (error) {
    console.warn("ensureProfileExists: unexpected error", error);
    return null;
  }
}
