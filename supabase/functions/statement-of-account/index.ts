import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { getResendFromAddress, parseResendErrorMessage, ResendApiError, sendResendEmail } from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TransactionData {
  id: string;
  date: string;
  description: string;
  type: "credit" | "debit";
  amount: number;
  balanceAfter: number;
  reference: string;
  category: string;
}

interface StatementSummary {
  totalCredits: number;
  totalDebits: number;
  netAmount: number;
  transactionCount: number;
  openingBalance: number;
  closingBalance: number;
}

interface StatementPdfResult {
  pdfBytes: Uint8Array;
  summary: StatementSummary;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Sanitizes text for PDF rendering by replacing unsupported Unicode characters
 */
function sanitizeTextForPDF(text: string): string {
  // Replace Naira symbol with NGN
  return text.replace(/₦/g, "NGN");
}

/**
 * Formats currency for display (for PDF - uses NGN instead of ₦ to avoid encoding issues)
 */
function formatCurrency(amount: number): string {
  return `NGN ${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Draws a line on the PDF page
 */
function drawLine(page: PDFPage, x: number, y: number, width: number, color = rgb(0.8, 0.8, 0.8)) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.5,
    color,
  });
}

/**
 * Draws a vertical line on the PDF page
 */
function drawVerticalLine(page: PDFPage, x: number, y: number, height: number, color = rgb(0.8, 0.8, 0.8)) {
  page.drawLine({
    start: { x, y },
    end: { x, y: y - height },
    thickness: 0.5,
    color,
  });
}

/**
 * Draws a table cell with text and borders
 */
function drawTableCell(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  font: any,
  fontSize: number,
  textColor: any,
  align: "left" | "center" | "right" = "left",
  padding: number = 5
) {
  // Sanitize text to remove unsupported Unicode characters
  const sanitizedText = sanitizeTextForPDF(text);
  
  // Calculate text position based on alignment
  let textX = x + padding;
  if (align === "center") {
    const textWidth = font.widthOfTextAtSize(sanitizedText, fontSize);
    textX = x + (width - textWidth) / 2;
  } else if (align === "right") {
    const textWidth = font.widthOfTextAtSize(sanitizedText, fontSize);
    textX = x + width - textWidth - padding;
  }

  // Draw cell borders
  drawLine(page, x, y, width);
  drawLine(page, x, y - height, width);
  drawVerticalLine(page, x, y, height);
  drawVerticalLine(page, x + width, y, height);

  // Draw text (truncate if too long)
  const maxTextWidth = width - padding * 2;
  let displayText = sanitizedText;
  if (font.widthOfTextAtSize(sanitizedText, fontSize) > maxTextWidth) {
    let truncated = sanitizedText;
    while (font.widthOfTextAtSize(truncated + "...", fontSize) > maxTextWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    displayText = truncated + "...";
  }

  page.drawText(displayText, {
    x: textX,
    y: y - height + (height - fontSize) / 2 + 2,
    size: fontSize,
    font,
    color: textColor,
  });
}

/**
 * Fetches all transactions for a user within a date range
 */
async function fetchAllTransactions(
  supabase: any,
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<TransactionData[]> {
  const [
    userTxns,
    airtimeTxns,
    dataTxns,
    electricityTxns,
    educationTxns,
    bettingTxns,
    transfersSent,
    transfersReceived,
    fundingTxns,
  ] = await Promise.all([
    supabase
      .from("user_transactions")
      .select("id, amount, transaction_type, description, reference, created_at, balance_after, balance_before")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("airtime_transactions")
      .select("id, amount, network, status, reference, phone_number, created_at")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("data_transactions")
      .select("id, amount, network, plan_name, status, reference, phone_number, created_at")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("electricity_transactions")
      .select("id, amount, provider, status, reference, meter_number, created_at, customer_name")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("education_transactions")
      .select("id, amount, exam_type, status, reference, created_at")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("betting_transactions")
      .select("id, amount, betting_provider, status, reference, account_number, created_at")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("transfer_transactions")
      .select(
        "id, amount, status, reference, description, created_at, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name, email)"
      )
      .eq("sender_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("transfer_transactions")
      .select(
        "id, amount, status, reference, description, created_at, sender:profiles!transfer_transactions_sender_id_fkey(full_name, email)"
      )
      .eq("recipient_id", userId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),

    supabase
      .from("funding_transactions")
      .select("id, amount, status, reference, bank_name, created_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  // Combine and format all transactions
  const walletReferences = new Set(
    (userTxns.data || [])
      .map((txn: any) => txn.reference)
      .filter((reference: string | null | undefined): reference is string => Boolean(reference)),
  );

  const combined: TransactionData[] = [
    ...(userTxns.data || []).map((txn: any) => {
      const tt = (txn.transaction_type || "").toLowerCase();
      const isRefund = tt === "refund";
      return {
        id: txn.id,
        date: txn.created_at,
        description: txn.description || txn.transaction_type,
        type: tt === "credit" || isRefund ? "credit" : "debit",
        amount: txn.amount,
        balanceAfter: txn.balance_after || 0,
        reference: txn.reference || "",
        category: "Wallet",
      };
    }),
    ...(airtimeTxns.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Airtime Purchase - ${txn.network} ${txn.phone_number}`,
      type: "debit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Airtime",
    })),
    ...(dataTxns.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Data Purchase - ${txn.network} ${txn.plan_name}`,
      type: "debit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Data",
    })),
    ...(electricityTxns.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Electricity - ${txn.provider} ${txn.meter_number || ""}`,
      type: "debit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Electricity",
    })),
    ...(educationTxns.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Education - ${txn.exam_type}`,
      type: "debit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Education",
    })),
    ...(bettingTxns.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Betting - ${txn.betting_provider} ${txn.account_number || ""}`,
      type: "debit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Betting",
    })),
    ...(transfersSent.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Transfer to ${txn.recipient?.full_name || txn.recipient?.email || "User"}`,
      type: "debit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Transfer",
    })),
    ...(transfersReceived.data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Transfer from ${txn.sender?.full_name || txn.sender?.email || "User"}`,
      type: "credit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Transfer",
    })),
    ...(fundingTxns.data || [])
      .filter((txn: any) => txn.reference && !walletReferences.has(txn.reference))
      .map((txn: any) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Account Funding - ${txn.bank_name || "Bank Transfer"}`,
      type: "credit",
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || "",
      category: "Funding",
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return combined;
}

/**
 * Gets the opening balance (balance before the statement period)
 */
async function getOpeningBalance(supabase: any, userId: string, startDate: Date): Promise<number> {
  const { data: lastTxn } = await supabase
    .from("user_transactions")
    .select("balance_after")
    .eq("user_id", userId)
    .lt("created_at", startDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTxn?.balance_after !== undefined && lastTxn.balance_after !== null) {
    return lastTxn.balance_after;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .maybeSingle();

  return profile?.balance || 0;
}

async function buildStatementData(
  supabase: any,
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ summary: StatementSummary; transactions: TransactionData[] }> {
  const [transactions, openingBalance] = await Promise.all([
    fetchAllTransactions(supabase, userId, startDate, endDate),
    getOpeningBalance(supabase, userId, startDate),
  ]);

  let runningBalance = openingBalance;
  const transactionsWithBalance = transactions.map((txn) => {
    if (txn.type === "credit") {
      runningBalance += txn.amount;
    } else {
      runningBalance -= txn.amount;
    }
    return { ...txn, balanceAfter: runningBalance };
  });

  const totalCredits = transactions
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebits = transactions
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    summary: {
      totalCredits,
      totalDebits,
      netAmount: totalCredits - totalDebits,
      transactionCount: transactions.length,
      openingBalance,
      closingBalance: runningBalance,
    },
    transactions: transactionsWithBalance,
  };
}

function buildTransactionsEmailTable(transactions: TransactionData[]): string {
  if (transactions.length === 0) {
    return `
      <p style="margin: 0; color: #667085; font-size: 14px;">No transactions were recorded for this period.</p>
    `;
  }

  const rows = [...transactions].reverse().map((txn) => {
    const amountPrefix = txn.type === "credit" ? "+" : "-";
    const amountColor = txn.type === "credit" ? "#10B981" : "#EF4444";
    return `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eef2f6; color: #667085; font-size: 13px; white-space: nowrap;">${escapeHtml(formatDate(txn.date))}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eef2f6; color: #1A2B4A; font-size: 13px;">${escapeHtml(txn.description)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eef2f6; color: ${amountColor}; font-size: 13px; text-align: right; white-space: nowrap; font-weight: 600;">${amountPrefix}${formatCurrency(txn.amount)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eef2f6; color: #667085; font-size: 13px; text-align: right; white-space: nowrap;">${formatCurrency(txn.balanceAfter)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="overflow-x: auto; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; color: #333333; font-size: 14px; font-weight: 700;">Transactions</p>
      <table style="width: 100%; border-collapse: collapse; min-width: 480px;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 10px 8px; text-align: left; color: #667085; font-size: 12px; font-weight: 600; border-bottom: 1px solid #eef2f6;">Date</th>
            <th style="padding: 10px 8px; text-align: left; color: #667085; font-size: 12px; font-weight: 600; border-bottom: 1px solid #eef2f6;">Description</th>
            <th style="padding: 10px 8px; text-align: right; color: #667085; font-size: 12px; font-weight: 600; border-bottom: 1px solid #eef2f6;">Amount</th>
            <th style="padding: 10px 8px; text-align: right; color: #667085; font-size: 12px; font-weight: 600; border-bottom: 1px solid #eef2f6;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function buildTransactionsEmailText(transactions: TransactionData[]): string {
  if (transactions.length === 0) {
    return "No transactions were recorded for this period.";
  }

  return [...transactions].reverse().map((txn, index) => {
    const amountPrefix = txn.type === "credit" ? "+" : "-";
    return `${index + 1}. ${formatDate(txn.date)} - ${txn.description} - ${amountPrefix}${formatCurrency(txn.amount)} - Balance: ${formatCurrency(txn.balanceAfter)}`;
  }).join("\n");
}

/**
 * Generates a comprehensive statement PDF
 */
async function generateStatementPDF(
  supabase: any,
  userId: string,
  userName: string,
  userEmail: string,
  userPhone: string,
  startDate: Date,
  endDate: Date
): Promise<StatementPdfResult> {
  try {
    console.log("generateStatementPDF: Fetching transactions and opening balance...");
    const [transactions, openingBalance] = await Promise.all([
      fetchAllTransactions(supabase, userId, startDate, endDate),
      getOpeningBalance(supabase, userId, startDate),
    ]);
    console.log("generateStatementPDF: Fetched", transactions.length, "transactions");
    console.log("generateStatementPDF: Opening balance:", openingBalance);

    // Calculate closing balance
    let runningBalance = openingBalance;
    const transactionsWithBalance = transactions.map((txn) => {
      if (txn.type === "credit") {
        runningBalance += txn.amount;
      } else {
        runningBalance -= txn.amount;
      }
      return { ...txn, balanceAfter: runningBalance };
    });
    const closingBalance = runningBalance;

    // Calculate summary statistics
    const totalCredits = transactions.filter((t) => t.type === "credit").reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = transactions.filter((t) => t.type === "debit").reduce((sum, t) => sum + t.amount, 0);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 40;
    const margin = 50;
    const contentWidth = width - margin * 2;

    // Try to fetch and embed logo (with timeout so PDF generation cannot hang)
    let logoImage: any = null;
    try {
      const LOGO_URL = Deno.env.get("NETPAY_LOGO_URL") || "https://netppay.com/logo.png";
      console.log("Fetching logo from:", LOGO_URL);
      const logoController = new AbortController();
      const logoTimeout = setTimeout(() => logoController.abort(), 4000);
      const logoResponse = await fetch(LOGO_URL, { signal: logoController.signal });
      clearTimeout(logoTimeout);
      if (logoResponse.ok) {
        const logoBytes = await logoResponse.arrayBuffer();
        const logoUint8Array = new Uint8Array(logoBytes);
        // Try PNG first, then JPEG
        try {
          logoImage = await pdfDoc.embedPng(logoUint8Array);
        } catch {
          try {
            logoImage = await pdfDoc.embedJpg(logoUint8Array);
          } catch {
            console.log("Could not embed logo image");
          }
        }
      }
    } catch (error) {
      console.log("Error fetching logo:", error);
    }

    // Header with gradient background effect (using rectangle)
    const headerHeight = 100;
    page.drawRectangle({
      x: 0,
      y: height - headerHeight,
      width: width,
      height: headerHeight,
      color: rgb(1, 0.5, 0), // Orange background
    });

    // Draw logo if available
    if (logoImage) {
      const logoDims = logoImage.scale(0.15); // Scale logo appropriately
      page.drawImage(logoImage, {
        x: margin,
        y: height - 50 - logoDims.height / 2,
        width: logoDims.width,
        height: logoDims.height,
      });
    }

    // Company name and title
    const companyX = logoImage ? margin + 80 : margin;
    page.drawText("NETPAY", {
      x: companyX,
      y: height - 50,
      size: 28,
      font: titleFont,
      color: rgb(1, 1, 1), // White text
    });

    page.drawText("STATEMENT", {
      x: companyX,
      y: height - 75,
      size: 14,
      font: boldFont,
      color: rgb(1, 1, 1), // White text
    });

    y = height - headerHeight - 30;

    // Account Information Section with background
    const infoBoxY = y;
    const infoBoxHeight = 90;
    page.drawRectangle({
      x: margin,
      y: y - infoBoxHeight,
      width: contentWidth,
      height: infoBoxHeight,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    });

    y -= 15;
    page.drawText("Account Information", {
      x: margin + 10,
      y,
      size: 11,
      font: boldFont,
      color: rgb(1, 0.5, 0),
    });
    y -= 18;

    const infoLeftX = margin + 10;
    const infoRightX = margin + contentWidth / 2 + 10;
    let infoY = y;

    page.drawText(`Account Name:`, {
      x: infoLeftX,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(sanitizeTextForPDF(userName), {
      x: infoLeftX + 70,
      y: infoY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    infoY -= 14;

    page.drawText(`Email:`, {
      x: infoLeftX,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(sanitizeTextForPDF(userEmail), {
      x: infoLeftX + 70,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    infoY -= 14;

    page.drawText(`Phone Number:`, {
      x: infoLeftX,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(sanitizeTextForPDF(userPhone), {
      x: infoLeftX + 70,
      y: infoY,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Statement Period (right side)
    infoY = y;
    page.drawText("Statement Period", {
      x: infoRightX,
      y: infoY,
      size: 11,
      font: boldFont,
      color: rgb(1, 0.5, 0),
    });
    infoY -= 18;

    page.drawText(`From:`, {
      x: infoRightX,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(startDate.toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }), {
      x: infoRightX + 35,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    infoY -= 14;

    page.drawText(`To:`, {
      x: infoRightX,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(endDate.toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }), {
      x: infoRightX + 35,
      y: infoY,
      size: 9,
      font: regularFont,
      color: rgb(0, 0, 0),
    });

    y -= infoBoxHeight + 20;

    // Opening Balance highlight box
    const balanceBoxWidth = 200;
    const balanceBoxX = width - margin - balanceBoxWidth;
    page.drawRectangle({
      x: balanceBoxX,
      y: y - 25,
      width: balanceBoxWidth,
      height: 25,
      color: rgb(1, 0.95, 0.9),
      borderColor: rgb(1, 0.5, 0),
      borderWidth: 1.5,
    });
    page.drawText("Opening Balance", {
      x: balanceBoxX + 5,
      y: y - 10,
      size: 9,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(formatCurrency(openingBalance), {
      x: balanceBoxX + 5,
      y: y - 20,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 35;

    // Define table column widths
    const colWidths = {
      date: 70,
      description: 180,
      reference: 80,
      debit: 90,
      credit: 90,
      balance: 95,
    };
    const rowHeight = 20;
    const tableStartX = margin;
    let currentPage = page;

    // Transactions Table Header
    const headerColumns = [
      { width: colWidths.date, text: "Date", align: "left" as const },
      { width: colWidths.description, text: "Description", align: "left" as const },
      { width: colWidths.reference, text: "Reference", align: "left" as const },
      { width: colWidths.debit, text: "Debit", align: "right" as const },
      { width: colWidths.credit, text: "Credit", align: "right" as const },
      { width: colWidths.balance, text: "Balance", align: "right" as const },
    ];

    // Draw header row with gradient-like background
    page.drawRectangle({
      x: tableStartX,
      y: y - rowHeight,
      width: contentWidth,
      height: rowHeight,
      color: rgb(1, 0.5, 0),
    });

    // Draw header cells with dark text for better visibility on orange background
    let cellX = tableStartX;
    headerColumns.forEach((col) => {
      // Use dark orange/brown text instead of white for better contrast
      drawTableCell(currentPage, cellX, y, col.width, rowHeight, col.text, boldFont, 9, rgb(0.2, 0.1, 0), col.align);
      cellX += col.width;
    });
    
    // Draw bottom border for header
    drawLine(currentPage, tableStartX, y - rowHeight, contentWidth);
    y -= rowHeight + 8;

    // Transactions rows
    for (const txn of transactionsWithBalance) {
      if (y < 150) {
        drawLine(currentPage, tableStartX, y, contentWidth);
        y -= 10;
        currentPage = pdfDoc.addPage([595, 842]);
        y = height - 50;

        currentPage.drawRectangle({
          x: tableStartX,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: rgb(1, 0.5, 0),
        });

        cellX = tableStartX;
        headerColumns.forEach((col) => {
          // Use dark orange/brown text instead of white for better contrast
          drawTableCell(currentPage, cellX, y, col.width, rowHeight, col.text, boldFont, 9, rgb(0.2, 0.1, 0), col.align);
          cellX += col.width;
        });
        
        // Draw bottom border for header on new page
        drawLine(currentPage, tableStartX, y - rowHeight, contentWidth);
        y -= rowHeight + 8;
      }

      const txnDate = formatDate(txn.date);
      const description = sanitizeTextForPDF(txn.description);
      const reference = sanitizeTextForPDF(txn.reference || "-");

      const isEvenRow = transactionsWithBalance.indexOf(txn) % 2 === 0;
      if (isEvenRow) {
        currentPage.drawRectangle({
          x: tableStartX,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      const debitColor = txn.type === "debit" ? rgb(0.9, 0.2, 0.2) : rgb(0, 0, 0);
      const creditColor = txn.type === "credit" ? rgb(0.1, 0.7, 0.1) : rgb(0, 0, 0);

      cellX = tableStartX;
      drawTableCell(currentPage, cellX, y, colWidths.date, rowHeight, txnDate, regularFont, 8, rgb(0, 0, 0), "left");
      cellX += colWidths.date;
      drawTableCell(currentPage, cellX, y, colWidths.description, rowHeight, description, regularFont, 8, rgb(0, 0, 0), "left");
      cellX += colWidths.description;
      drawTableCell(currentPage, cellX, y, colWidths.reference, rowHeight, reference, regularFont, 8, rgb(0, 0, 0), "left");
      cellX += colWidths.reference;
      drawTableCell(
        currentPage,
        cellX,
        y,
        colWidths.debit,
        rowHeight,
        txn.type === "debit" ? formatCurrency(txn.amount) : "-",
        regularFont,
        8,
        debitColor,
        "right"
      );
      cellX += colWidths.debit;
      drawTableCell(
        currentPage,
        cellX,
        y,
        colWidths.credit,
        rowHeight,
        txn.type === "credit" ? formatCurrency(txn.amount) : "-",
        regularFont,
        8,
        creditColor,
        "right"
      );
      cellX += colWidths.credit;
      drawTableCell(
        currentPage,
        cellX,
        y,
        colWidths.balance,
        rowHeight,
        formatCurrency(txn.balanceAfter),
        regularFont,
        8,
        rgb(0, 0, 0),
        "right"
      );

      y -= rowHeight;
    }

    drawLine(currentPage, tableStartX, y, contentWidth);
    y -= 20;

    // Summary Section with styled boxes
    currentPage.drawText("Summary", {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: rgb(1, 0.5, 0),
    });
    y -= 25;

    // Summary boxes in two columns
    const summaryBoxWidth = (contentWidth - 10) / 2;
    const summaryBoxHeight = 50;
    let summaryY = y;

    // Total Credits box
    currentPage.drawRectangle({
      x: margin,
      y: summaryY - summaryBoxHeight,
      width: summaryBoxWidth,
      height: summaryBoxHeight,
      color: rgb(0.95, 1, 0.95),
      borderColor: rgb(0.1, 0.7, 0.1),
      borderWidth: 1.5,
    });
    currentPage.drawText("Total Credits", {
      x: margin + 8,
      y: summaryY - 12,
      size: 9,
      font: regularFont,
      color: rgb(0.3, 0.5, 0.3),
    });
    currentPage.drawText(formatCurrency(totalCredits), {
      x: margin + 8,
      y: summaryY - 28,
      size: 14,
      font: boldFont,
      color: rgb(0.1, 0.7, 0.1),
    });

    // Total Debits box
    currentPage.drawRectangle({
      x: margin + summaryBoxWidth + 10,
      y: summaryY - summaryBoxHeight,
      width: summaryBoxWidth,
      height: summaryBoxHeight,
      color: rgb(1, 0.95, 0.95),
      borderColor: rgb(0.9, 0.2, 0.2),
      borderWidth: 1.5,
    });
    currentPage.drawText("Total Debits", {
      x: margin + summaryBoxWidth + 18,
      y: summaryY - 12,
      size: 9,
      font: regularFont,
      color: rgb(0.5, 0.3, 0.3),
    });
    currentPage.drawText(formatCurrency(totalDebits), {
      x: margin + summaryBoxWidth + 18,
      y: summaryY - 28,
      size: 14,
      font: boldFont,
      color: rgb(0.9, 0.2, 0.2),
    });

    summaryY -= summaryBoxHeight + 12;

    // Net Amount box
    currentPage.drawRectangle({
      x: margin,
      y: summaryY - summaryBoxHeight,
      width: summaryBoxWidth,
      height: summaryBoxHeight,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1.5,
    });
    currentPage.drawText("Net Amount", {
      x: margin + 8,
      y: summaryY - 12,
      size: 9,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    const netAmount = totalCredits - totalDebits;
    currentPage.drawText(formatCurrency(netAmount), {
      x: margin + 8,
      y: summaryY - 28,
      size: 14,
      font: boldFont,
      color: netAmount >= 0 ? rgb(0.1, 0.7, 0.1) : rgb(0.9, 0.2, 0.2),
    });

    // Transaction Count box
    currentPage.drawRectangle({
      x: margin + summaryBoxWidth + 10,
      y: summaryY - summaryBoxHeight,
      width: summaryBoxWidth,
      height: summaryBoxHeight,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.3, 0.5, 0.8),
      borderWidth: 1.5,
    });
    currentPage.drawText("Transactions", {
      x: margin + summaryBoxWidth + 18,
      y: summaryY - 12,
      size: 9,
      font: regularFont,
      color: rgb(0.3, 0.4, 0.5),
    });
    currentPage.drawText(transactions.length.toString(), {
      x: margin + summaryBoxWidth + 18,
      y: summaryY - 28,
      size: 14,
      font: boldFont,
      color: rgb(0.3, 0.5, 0.8),
    });

    summaryY -= summaryBoxHeight + 20;

    // Closing Balance highlight box
    const closingBoxWidth = contentWidth;
    currentPage.drawRectangle({
      x: margin,
      y: summaryY - 35,
      width: closingBoxWidth,
      height: 35,
      color: rgb(1, 0.95, 0.9),
      borderColor: rgb(1, 0.5, 0),
      borderWidth: 2,
    });
    currentPage.drawText("Closing Balance", {
      x: margin + 10,
      y: summaryY - 12,
      size: 10,
      font: regularFont,
      color: rgb(0.5, 0.3, 0.1),
    });
    currentPage.drawText(formatCurrency(closingBalance), {
      x: margin + 10,
      y: summaryY - 28,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    summaryY -= 50;

    // Footer section
    drawLine(currentPage, margin, summaryY, contentWidth);
    summaryY -= 15;

    currentPage.drawText("This is a computer-generated statement.", {
      x: margin,
      y: summaryY,
      size: 8,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    summaryY -= 12;

    currentPage.drawText("For inquiries, please contact support@netppay.com", {
      x: margin,
      y: summaryY,
      size: 8,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });
    summaryY -= 12;

    currentPage.drawText(`Generated on: ${new Date().toLocaleString("en-NG")}`, {
      x: margin,
      y: summaryY,
      size: 8,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    console.log("generateStatementPDF: Saving PDF document...");
    const pdfBytes = await pdfDoc.save();
    console.log("generateStatementPDF: PDF saved, size:", pdfBytes.length);
    return {
      pdfBytes,
      summary: {
        totalCredits,
        totalDebits,
        netAmount: totalCredits - totalDebits,
        transactionCount: transactions.length,
        openingBalance,
        closingBalance,
      },
    };
  } catch (error) {
    console.error("Error in generateStatementPDF:", error);
    console.error("Error type:", typeof error);
    console.error("Error name:", error instanceof Error ? error.name : "N/A");
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "N/A");
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildStatementEmailHtml(
  userName: string,
  formattedStartDate: string,
  formattedEndDate: string,
  summary?: StatementSummary,
  transactions: TransactionData[] = [],
  attachmentNote?: string,
) {
  const LOGO_URL = Deno.env.get("NETPAY_LOGO_URL") || "https://netppay.com/logo.png";
  const safeName = escapeHtml(userName || "Valued Customer");

  const summaryBlock = summary ? `
            <div style="background-color: #fff7f0; border: 1px solid rgba(255,127,0,0.25); border-radius: 12px; padding: 18px; margin: 24px 0;">
              <p style="margin: 0 0 12px 0; color: #333333; font-size: 14px; font-weight: 700;">Statement Summary</p>
              <p style="margin: 0 0 6px 0; color: #555555; font-size: 14px;">Total Credits: <strong>${formatCurrency(summary.totalCredits)}</strong></p>
              <p style="margin: 0 0 6px 0; color: #555555; font-size: 14px;">Total Debits: <strong>${formatCurrency(summary.totalDebits)}</strong></p>
              <p style="margin: 0 0 6px 0; color: #555555; font-size: 14px;">Net Amount: <strong>${formatCurrency(summary.netAmount)}</strong></p>
              <p style="margin: 0; color: #555555; font-size: 14px;">Transactions: <strong>${summary.transactionCount}</strong></p>
            </div>
  ` : "";

  const attachmentMessage = attachmentNote
    ? `<p style="margin: 0 0 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">${escapeHtml(attachmentNote)}</p>`
    : `<p style="margin: 0 0 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">Your statement is attached as a PDF document for your records. Please review it carefully and contact our support team if you notice any discrepancies or have any questions.</p>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #ff7f00 0%, #ff9f3f 100%); padding: 40px 32px; text-align: center;">
            <img src="${LOGO_URL}" alt="NetPay Logo" style="height: 60px; width: auto; margin-bottom: 16px;" />
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Statement</h1>
          </div>

          <div style="padding: 40px 32px;">
            <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
              Dear ${safeName},
            </p>

            <p style="margin: 0 0 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">
              Thank you for being a valued NetPay customer. As requested, here is your statement for the period from <strong>${formattedStartDate}</strong> to <strong>${formattedEndDate}</strong>.
            </p>

            ${summaryBlock}
            ${buildTransactionsEmailTable(transactions)}
            ${attachmentMessage}

            <div style="background-color: #fff7f0; border-left: 4px solid #ff7f00; padding: 16px; margin: 24px 0; border-radius: 4px;">
              <p style="margin: 0; color: #333333; font-size: 14px; line-height: 1.6;">
                <strong>Need Assistance?</strong><br />
                Our support team is available to help you at <a href="mailto:support@netppay.com" style="color: #ff7f00; text-decoration: none;">support@netppay.com</a>.
              </p>
            </div>

            <p style="margin: 20px 0 0 0; color: #555555; font-size: 15px; line-height: 1.7;">
              Best regards,<br />
              <strong style="color: #ff7f00;">The NetPay Team</strong>
            </p>
          </div>

          <div style="background-color: #f9f9f9; padding: 24px 32px; text-align: center; border-top: 1px solid #eeeeee;">
            <p style="margin: 0; color: #888888; font-size: 12px;">
              © ${new Date().getFullYear()} NetPay. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Sends statement summary email quickly (no PDF attachment — use Download PDF in app).
 */
async function sendStatementSummaryEmail(
  to: string,
  userName: string,
  startDate: Date,
  endDate: Date,
  summary: StatementSummary,
  transactions: TransactionData[],
): Promise<void> {
  const FROM_ADDRESS = getResendFromAddress();
  const formattedStartDate = startDate.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
  const formattedEndDate = endDate.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
  const subject = `Your NetPay Statement - ${formattedStartDate} to ${formattedEndDate}`;
  const emailHtml = buildStatementEmailHtml(
    userName,
    formattedStartDate,
    formattedEndDate,
    summary,
    transactions,
    "For a printable PDF copy, open the NetPay app, go to Statement, and tap Download PDF.",
  );
  const emailText = [
    `Dear ${userName || "Valued Customer"},`,
    "",
    `Your NetPay statement for ${formattedStartDate} to ${formattedEndDate}:`,
    `Total Credits: ${formatCurrency(summary.totalCredits)}`,
    `Total Debits: ${formatCurrency(summary.totalDebits)}`,
    `Net Amount: ${formatCurrency(summary.netAmount)}`,
    `Transactions: ${summary.transactionCount}`,
    "",
    buildTransactionsEmailText(transactions),
    "",
    "For a printable PDF copy, use Download PDF in the NetPay app.",
    "",
    "Best regards,",
    "The NetPay Team",
  ].join("\n");

  await sendResendEmail({
    from: FROM_ADDRESS,
    to: [to],
    subject,
    text: emailText,
    html: emailHtml,
    tags: [{ name: "notification_type", value: "statement" }],
  });
}

serve(async (req) => {
  console.log("=== Statement Function Called ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    console.log("Supabase URL configured:", !!supabaseUrl);
    console.log("Service key configured:", !!supabaseServiceKey);
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase configuration missing");
      return new Response(
        JSON.stringify({ success: false, error: "Supabase configuration missing" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Extract token from Authorization header
    const token = authHeader.replace("Bearer ", "").trim();
    console.log("Token extracted:", !!token, "Length:", token.length);
    if (!token) {
      console.error("Invalid authorization token");
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authorization token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for database queries (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication using the token
    console.log("Verifying authentication...");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      console.error("User:", user);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", details: authError?.message }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    
    console.log("User authenticated:", user.id);

    // Parse request body or query parameters
    let startDate: Date;
    let endDate: Date;
    let sendEmail = false;
    let emailAddress: string | null = null;

    if (req.method === "POST") {
      console.log("Parsing POST body...");
      const body = await req.json();
      console.log("Body:", JSON.stringify(body));
      startDate = body.start ? new Date(body.start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      endDate = body.end ? new Date(body.end) : new Date();
      sendEmail = body.send_email === true || body.send_email === "true";
      emailAddress = body.email || null;
    } else {
      // GET request - parse query parameters
      const url = new URL(req.url);
      const startParam = url.searchParams.get("start");
      const endParam = url.searchParams.get("end");
      const sendEmailParam = url.searchParams.get("send_email");
      const emailParam = url.searchParams.get("email");

      startDate = startParam ? new Date(startParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      endDate = endParam ? new Date(endParam) : new Date();
      sendEmail = sendEmailParam === "true" || sendEmailParam === "1";
      emailAddress = emailParam;
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    console.log("Date range:", {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      sendEmail,
    });

    // Get user profile
    console.log("Fetching user profile...");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
    }

    const userName = profile?.full_name || user.email?.split("@")[0] || "User";
    const userEmail = emailAddress || profile?.email || user.email || "";
    const userPhone = profile?.phone || "N/A";
    
    console.log("User info:", { userName, userEmail });

    // Send email or return PDF
    if (sendEmail && userEmail) {
      console.log("Sending statement summary email to:", userEmail);
      try {
        const { summary, transactions } = await buildStatementData(supabase, user.id, startDate, endDate);
        await sendStatementSummaryEmail(userEmail, userName, startDate, endDate, summary, transactions);
      } catch (emailError) {
        console.error("Failed to send statement email:", emailError);
        let message = "Failed to send email. Please try again.";
        if (emailError instanceof ResendApiError) {
          message = parseResendErrorMessage(emailError.details);
        } else if (emailError instanceof Error && emailError.message) {
          message = emailError.message;
        }
        return new Response(
          JSON.stringify({ success: false, error: message }),
          { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      console.log("Email sent successfully");
      return new Response(
        JSON.stringify({ success: true, message: "Statement sent to email" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Generate PDF for download
    console.log("Starting PDF generation...");
    const { pdfBytes } = await generateStatementPDF(
      supabase,
      user.id,
      userName,
      userEmail,
      userPhone,
      startDate,
      endDate
    );
    console.log("PDF generated successfully, size:", pdfBytes.length);

    console.log("Returning PDF response");
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-${user.id}-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating statement:", error);
    console.error("Error type:", typeof error);
    console.error("Error name:", error instanceof Error ? error.name : "N/A");
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "N/A");
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack?.substring(0, 500),
    } : String(error);
    
    // Provide more descriptive error message
    let userFriendlyMessage = "Failed to generate statement";
    if (errorMessage.includes("PDF generation failed")) {
      userFriendlyMessage = errorMessage.replace("PDF generation failed: ", "");
    } else if (errorMessage.includes("fetch")) {
      userFriendlyMessage = "Unable to fetch transaction data. Please try again.";
    } else if (errorMessage.includes("database") || errorMessage.includes("query")) {
      userFriendlyMessage = "Database error occurred. Please contact support.";
    } else if (errorMessage) {
      userFriendlyMessage = errorMessage;
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: userFriendlyMessage,
        message: errorMessage,
        details: errorDetails,
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
