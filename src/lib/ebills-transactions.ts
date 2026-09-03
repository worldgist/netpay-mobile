import { supabase } from '@/integrations/supabase/client';

export interface EBillsApiTransaction {
  id: string;
  service_type: string;
  user_id: string;
  amount: number;
  purchase_amount?: number | null;
  charge_fee?: number | null;
  balance_before: number;
  balance_after: number;
  status: string;
  reference: string;
  created_at: string;
  meter_number?: string;
  provider?: string;
  meter_type?: string;
  customer_name?: string;
  betting_provider?: string;
  account_number?: string;
  smartcard_number?: string;
  plan_name?: string;
  phone_number?: string;
  network?: string;
  exam_type?: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

const SERVICE_TABLES = [
  { table: 'airtime_transactions', service: 'airtime' },
  { table: 'data_transactions', service: 'data' },
  { table: 'electricity_transactions', service: 'electricity' },
  { table: 'cable_tv_transactions', service: 'cable_tv' },
  { table: 'betting_transactions', service: 'betting' },
] as const;

function isEbillsRow(row: Record<string, unknown>): boolean {
  const vendor = String(row.vending_provider ?? '').toLowerCase();
  if (vendor === 'ebills' || vendor === 'ebills.africa') return true;

  const reference = String(row.reference ?? '');
  if (/ebills/i.test(reference) || reference.startsWith('req_')) return true;

  try {
    const api = JSON.stringify(row.api_response ?? '');
    if (/ebills\.africa/i.test(api)) return true;
  } catch {
    // ignore stringify failures
  }

  return false;
}

function mapRow(row: Record<string, unknown>, serviceType: string): EBillsApiTransaction {
  const profiles = row.profiles as EBillsApiTransaction['profiles'] | undefined;

  return {
    id: String(row.id),
    service_type: serviceType,
    user_id: String(row.user_id ?? ''),
    amount: Number(row.amount ?? 0),
    purchase_amount: row.purchase_amount == null ? null : Number(row.purchase_amount),
    charge_fee: row.charge_fee == null ? null : Number(row.charge_fee),
    balance_before: Number(row.balance_before ?? 0),
    balance_after: Number(row.balance_after ?? 0),
    status: String(row.status || 'unknown'),
    reference: String(row.reference || row.id),
    created_at: String(row.created_at || new Date().toISOString()),
    meter_number: row.meter_number == null ? undefined : String(row.meter_number),
    provider: row.provider == null ? undefined : String(row.provider),
    meter_type: row.meter_type == null ? undefined : String(row.meter_type),
    customer_name: row.customer_name == null ? undefined : String(row.customer_name),
    betting_provider: row.betting_provider == null ? undefined : String(row.betting_provider),
    account_number: row.account_number == null ? undefined : String(row.account_number),
    smartcard_number: row.smartcard_number == null ? undefined : String(row.smartcard_number),
    plan_name: row.plan_name == null ? undefined : String(row.plan_name),
    phone_number: row.phone_number == null ? undefined : String(row.phone_number),
    network: row.network == null ? undefined : String(row.network),
    exam_type: row.exam_type == null ? undefined : String(row.exam_type),
    profiles: profiles ?? null,
  };
}

async function fetchTableFallback(table: string, service: string): Promise<EBillsApiTransaction[]> {
  const attempts = [
    'vending_provider.eq.ebills,vending_provider.eq.ebills.africa,reference.ilike.%EBILLS%,reference.ilike.req_%',
    'provider.eq.ebills,reference.ilike.%EBILLS%,reference.ilike.req_%',
    'reference.ilike.%EBILLS%,reference.ilike.req_%',
  ];

  for (const filter of attempts) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .or(filter)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!error) {
      return ((data || []) as Record<string, unknown>[])
        .filter(isEbillsRow)
        .map((row) => mapRow(row, service));
    }
  }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn(`eBills table fallback failed for ${table}:`, error.message);
    return [];
  }

  return ((data || []) as Record<string, unknown>[])
    .filter(isEbillsRow)
    .map((row) => mapRow(row, service));
}

export async function fetchEbillsApiTransactions(): Promise<EBillsApiTransaction[]> {
  const { data, error } = await supabase.functions.invoke('fetch-ebills-transactions');

  if (!error && data?.success) {
    return (data.transactions || []) as EBillsApiTransaction[];
  }

  console.warn('fetch-ebills-transactions unavailable, using table fallback', error || data?.error);

  const results = await Promise.all(
    SERVICE_TABLES.map(({ table, service }) => fetchTableFallback(table, service)),
  );

  return results
    .flat()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
