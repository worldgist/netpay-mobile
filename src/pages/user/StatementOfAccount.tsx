import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type StatementRow = {
	id: string;
	date: string;
	description: string;
	type: "credit" | "debit";
	amount: number;
	balanceAfter: number;
	reference: string;
	category: string;
};

const formatCurrency = (amount: number) =>
	`N${amount.toLocaleString("en-NG", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;

const formatDateInput = (date: Date) => {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string) => {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export default function StatementOfAccount() {
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [userId, setUserId] = useState("");
	const [rows, setRows] = useState<StatementRow[]>([]);
	const [startDate, setStartDate] = useState(() => {
		const date = new Date();
		date.setMonth(date.getMonth() - 1);
		return formatDateInput(date);
	});
	const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));

	const fetchStatement = async (currentUserId: string, from: string, to: string) => {
		const start = parseDateInput(from);
		start.setHours(0, 0, 0, 0);

		const end = parseDateInput(to);
		end.setHours(23, 59, 59, 999);

		const { data, error } = await supabase
			.from("user_transactions")
			.select("id, amount, transaction_type, description, reference, created_at, balance_after")
			.eq("user_id", currentUserId)
			.gte("created_at", start.toISOString())
			.lte("created_at", end.toISOString())
			.order("created_at", { ascending: false });

		if (error) throw error;

		const mapped: StatementRow[] = (data || []).map((txn) => {
			const txType = String(txn.transaction_type || "").toLowerCase();
			const isCredit = txType === "credit" || txType === "refund";
			return {
				id: txn.id,
				date: txn.created_at,
				description: txn.description || txn.transaction_type || "Transaction",
				type: isCredit ? "credit" : "debit",
				amount: Number(txn.amount || 0),
				balanceAfter: Number(txn.balance_after || 0),
				reference: txn.reference || "",
				category: "Wallet",
			};
		});

		setRows(mapped);
	};

	useEffect(() => {
		const initialize = async () => {
			try {
				setLoading(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					navigate("/user/auth");
					return;
				}

				setUserId(session.user.id);
				await fetchStatement(session.user.id, startDate, endDate);
			} catch (error: any) {
				console.error("Failed to load statement:", error);
				toast.error(error?.message || "Failed to load statement");
			} finally {
				setLoading(false);
			}
		};

		initialize();
	}, [navigate, startDate, endDate]);

	const summary = useMemo(() => {
		const totalCredits = rows.filter((item) => item.type === "credit").reduce((sum, item) => sum + item.amount, 0);
		const totalDebits = rows.filter((item) => item.type === "debit").reduce((sum, item) => sum + item.amount, 0);
		return {
			totalCredits,
			totalDebits,
			netAmount: totalCredits - totalDebits,
			count: rows.length,
		};
	}, [rows]);

	const downloadCsv = () => {
		if (!rows.length) {
			toast.error("No transactions available for this period");
			return;
		}

		const header = ["Date", "Description", "Type", "Amount", "Balance After", "Reference", "Category"];
		const body = rows.map((row) => [
			new Date(row.date).toISOString(),
			row.description,
			row.type,
			row.amount.toString(),
			row.balanceAfter.toString(),
			row.reference,
			row.category,
		]);

		const csv = [header, ...body]
			.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
			.join("\n");

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `statement-${startDate}-to-${endDate}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		toast.success("Statement downloaded");
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="relative h-14 w-14">
						<div className="absolute inset-0 rounded-full border-4 border-orange-100" />
						<div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand animate-spin" />
					</div>
					<p className="text-sm text-gray-600">Loading statement...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50 pb-20">
			<div className="bg-white border-b sticky top-0 z-10">
				<div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
					<button onClick={() => navigate("/user/profile")} className="text-gray-700 hover:text-brand">
						<ArrowLeft className="w-6 h-6" />
					</button>
					<h1 className="text-lg font-semibold text-gray-900">Statement</h1>
					<div className="w-6" />
				</div>
			</div>

			<div className="max-w-3xl mx-auto p-4 space-y-4">
				<div className="bg-white rounded-xl border p-4 space-y-3">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div>
							<label className="text-xs text-gray-500 block mb-1">Start Date</label>
							<input
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								className="w-full border rounded-lg px-3 py-2"
								max={endDate}
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 block mb-1">End Date</label>
							<input
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								className="w-full border rounded-lg px-3 py-2"
								min={startDate}
								max={formatDateInput(new Date())}
							/>
						</div>
					</div>
					<Button onClick={downloadCsv} className="w-full sm:w-auto">
						<Download className="w-4 h-4 mr-2" />
						Download CSV
					</Button>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<div className="bg-white border rounded-xl p-3">
						<p className="text-xs text-gray-500">Credits</p>
						<p className="font-semibold text-green-600">{formatCurrency(summary.totalCredits)}</p>
					</div>
					<div className="bg-white border rounded-xl p-3">
						<p className="text-xs text-gray-500">Debits</p>
						<p className="font-semibold text-red-600">{formatCurrency(summary.totalDebits)}</p>
					</div>
					<div className="bg-white border rounded-xl p-3">
						<p className="text-xs text-gray-500">Net</p>
						<p className={`font-semibold ${summary.netAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
							{formatCurrency(summary.netAmount)}
						</p>
					</div>
					<div className="bg-white border rounded-xl p-3">
						<p className="text-xs text-gray-500">Transactions</p>
						<p className="font-semibold text-gray-900">{summary.count}</p>
					</div>
				</div>

				<div className="bg-white border rounded-xl divide-y">
					{rows.length === 0 ? (
						<div className="p-8 text-center">
							<FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
							<p className="text-sm text-gray-600">No transactions found for this period.</p>
						</div>
					) : (
						rows.map((row) => (
							<div key={row.id} className="p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-gray-900">{row.description}</p>
										<p className="text-xs text-gray-500 mt-1">
											{new Date(row.date).toLocaleString("en-NG")} {row.reference ? `• Ref: ${row.reference}` : ""}
										</p>
									</div>
									<div className="text-right shrink-0">
										<p className={`text-sm font-semibold ${row.type === "credit" ? "text-green-600" : "text-red-600"}`}>
											{row.type === "credit" ? "+" : "-"}{formatCurrency(row.amount)}
										</p>
										<p className="text-xs text-gray-500">Bal: {formatCurrency(row.balanceAfter)}</p>
									</div>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
