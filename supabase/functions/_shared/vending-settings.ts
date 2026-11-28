/** Shared vending provider resolution for edge functions. */

export const VENDING_SETTING_KEYS = [
  "airtime_provider",
  "data_provider",
  "cable_provider",
  "electricity_provider",
  "betting_provider",
] as const;

export type VendingSettingKey = (typeof VENDING_SETTING_KEYS)[number];

export const DEFAULT_VENDING_PROVIDERS: Record<VendingSettingKey, string> = {
  airtime_provider: "smeplug",
  data_provider: "smeplug",
  cable_provider: "mobilenig",
  electricity_provider: "vtpass",
  betting_provider: "ebills",
};

export function extractProviderValue(rawValue: unknown): string | undefined {
  if (typeof rawValue === "string") {
    return rawValue;
  }
  if (rawValue && typeof rawValue === "object") {
    const obj = rawValue as Record<string, unknown>;
    if (typeof obj.provider === "string") return obj.provider;
    if (typeof obj.value === "string") return obj.value;
  }
  return undefined;
}

export function normalizeVendingProvider(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";

  let normalized = raw.toLowerCase().trim();
  if (normalized === "ebill" || normalized === "ebills.africa") normalized = "ebills";
  if (normalized === "mobile-nig" || normalized === "mobile_nig") normalized = "mobilenig";
  if (normalized === "vt-pass" || normalized === "vt_pass") normalized = "vtpass";
  if (normalized === "sme-plug" || normalized === "sme_plug") normalized = "smeplug";
  if (normalized === "flutter-wave" || normalized === "flutter_wave" || normalized === "flw") {
    normalized = "flutterwave";
  }
  if (
    normalized === "plustive" ||
    normalized === "plustiveimpact" ||
    normalized === "plustive-impact" ||
    normalized === "plustive_impact"
  ) {
    normalized = "plustive";
  }
  return normalized;
}

export function resolveVendingProvider(
  rawValue: unknown,
  settingKey: VendingSettingKey,
  _overrideIgnored?: unknown,
): string {
  // Client-supplied overrides are intentionally ignored to prevent vendor steering.
  const fromSetting = normalizeVendingProvider(extractProviderValue(rawValue));
  if (fromSetting) return fromSetting;

  return DEFAULT_VENDING_PROVIDERS[settingKey];
}

export async function fetchVendingProvider(
  supabase: { from: (table: string) => any },
  settingKey: VendingSettingKey,
  _overrideIgnored?: unknown,
): Promise<string> {
  // Never honor request-body vending_provider — admin app_settings only.
  const { data, error } = await supabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", settingKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`fetchVendingProvider(${settingKey}) error:`, error);
  }

  return resolveVendingProvider(data?.setting_value, settingKey);
}
