import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { formatNaira } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function BillLoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#FF7F00] animate-spin" />
      </div>
    </div>
  );
}

type BillPageHeaderProps = {
  title: string;
  backTo?: string;
  onBack?: () => void;
};

export function BillPageHeader({ title, backTo = "/user/paybills", onBack }: BillPageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-20 flex items-center bg-white px-5 pt-4 pb-3 border-b border-gray-100">
      <button
        type="button"
        onClick={() => (onBack ? onBack() : navigate(backTo))}
        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-50"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5 text-gray-900" />
      </button>
      <h1 className="flex-1 text-center text-xl font-bold text-gray-900">{title}</h1>
      <div className="w-10" />
    </div>
  );
}

export function BillBalanceCard({ balance }: { balance: number }) {
  return (
    <div className="rounded-xl bg-[#FF7F00] p-5 text-center shadow-sm">
      <p className="text-sm font-medium text-white/90">Available Balance</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-white">{formatNaira(balance)}</p>
    </div>
  );
}

export function BillSectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm font-semibold text-gray-800">{children}</p>;
}

export function BillField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

export const billInputClassName =
  "flex h-[50px] w-full rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] px-4 text-base text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#FF7F00] focus:ring-1 focus:ring-[#FF7F00]";

export function BillProviderTile({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 bg-white p-2 transition-all",
        selected ? "border-[#FF7F00] bg-[#FFF5E9]" : "border-transparent hover:border-orange-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BillStickyContinue({
  label = "Continue",
  disabled,
  loading,
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-6 border-t border-gray-100 bg-white px-5 pb-6 pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-[#FF7F00] text-lg font-bold text-white transition-opacity disabled:opacity-50"
      >
        {loading ? "Processing..." : label}
      </button>
    </div>
  );
}

type BillPurchaseLayoutProps = {
  title: string;
  balance: number;
  backTo?: string;
  onBack?: () => void;
  children: ReactNode;
  stickyContinue?: ReactNode;
};

export function BillPurchaseLayout({
  title,
  balance,
  backTo,
  onBack,
  children,
  stickyContinue,
}: BillPurchaseLayoutProps) {
  return (
    <div className="min-h-screen bg-white pb-8">
      <BillPageHeader title={title} backTo={backTo} onBack={onBack} />
      <div className="mx-auto max-w-md px-5 pt-4">
        <BillBalanceCard balance={balance} />
        <div className="mt-6 space-y-6">{children}</div>
        {stickyContinue}
      </div>
    </div>
  );
}

type DetailRow = { label: string; value: ReactNode };

type BillConfirmSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: number;
  charges?: number;
  quantity?: number;
  recipient: string;
  recipientLabel?: string;
  providerName: string;
  providerLogo?: string;
  serviceType?: string;
  planDetails?: string;
  customerName?: string;
  loading?: boolean;
};

export function BillConfirmSheet({
  open,
  onClose,
  onConfirm,
  amount,
  charges = 0,
  quantity = 1,
  recipient,
  recipientLabel = "Recipient",
  providerName,
  providerLogo,
  planDetails,
  customerName,
  loading = false,
}: BillConfirmSheetProps) {
  if (!open) return null;

  const total = (amount + charges) * quantity;
  const now = new Date();
  const dateLabel = now.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows: DetailRow[] = [
    {
      label: quantity > 1 ? `Price (×${quantity})` : "Price",
      value: formatNaira(amount * quantity),
    },
  ];
  if (charges > 0) {
    rows.push({
      label: quantity > 1 ? `Charge Fee (×${quantity})` : "Charge Fee",
      value: formatNaira(charges * quantity),
    });
  }
  if (quantity > 1) {
    rows.push({ label: "Quantity", value: `${quantity} PIN${quantity > 1 ? "s" : ""}` });
  }
  rows.push({ label: recipientLabel, value: recipient || "N/A" });
  if (planDetails) {
    rows.push({ label: "Plan", value: planDetails });
  }
  rows.push({
    label: "Provider",
    value: (
      <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
        {providerLogo ? (
          <img src={providerLogo} alt="" className="h-6 w-6 object-contain" />
        ) : null}
        {providerName}
      </span>
    ),
  });
  if (customerName) {
    rows.push({ label: "Customer Name", value: customerName });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        disabled={loading}
        onClick={loading ? undefined : onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white px-5 pt-5 pb-8 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-start border-b border-gray-100 pb-4">
          <button
            type="button"
            onClick={loading ? undefined : onClose}
            disabled={loading}
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-gray-700" />
          </button>
          <div className="min-w-0 flex-1 px-4 text-center">
            <p className="text-base font-semibold text-gray-500">Payment</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">{formatNaira(total)}</p>
          </div>
          <div className="w-8" />
        </div>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pb-4">
          <div className="rounded-2xl bg-[#FAFAFA] p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">Payment Details</p>
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="max-w-[60%] text-right font-semibold text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#FAFAFA] p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">Transaction Status</p>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Date</span>
                <span className="font-semibold text-gray-900">{dateLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Status</span>
                <span className="font-semibold text-[#2666CF]">{loading ? "Processing" : "Ready"}</span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-[#FF7F00] text-lg font-bold text-white disabled:opacity-60"
        >
          {loading ? "Processing..." : "Confirm to Pay"}
        </button>
      </div>
    </div>
  );
}

type BillSuccessSheetProps = {
  open: boolean;
  title?: string;
  description?: string;
  rows: DetailRow[];
  onDone: () => void;
};

export function BillSuccessSheet({
  open,
  title = "Purchase Successful!",
  description,
  rows,
  onDone,
}: BillSuccessSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white px-5 pt-6 pb-8 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF5E9]">
          <span className="text-2xl text-[#FF7F00]">✓</span>
        </div>
        <h2 className="text-center text-xl font-bold text-gray-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-center text-sm text-gray-500">{description}</p>
        ) : null}
        <div className="mt-5 space-y-3 rounded-2xl bg-[#FAFAFA] p-4">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 text-sm">
              <span className="text-gray-500">{row.label}</span>
              <span className="max-w-[60%] break-all text-right font-semibold text-gray-900">
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-xl bg-[#FF7F00] text-lg font-bold text-white"
        >
          View transactions
        </button>
      </div>
    </div>
  );
}
