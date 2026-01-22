import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

export interface StatementOptions {
  userId: string;
  startDate: Date;
  endDate: Date;
  userEmail?: string;
  userName?: string;
}

export interface TransactionData {
  id: string;
  date: string;
  description: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reference: string;
  category: string;
}

/**
 * Fetches all transactions for a user within a date range
 */
async function fetchAllTransactions(
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
    // User transactions (wallet credits/debits)
    supabase
      .from('user_transactions')
      .select('id, amount, transaction_type, description, reference, created_at, balance_after, balance_before')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Airtime transactions
    supabase
      .from('airtime_transactions')
      .select('id, amount, network, status, reference, phone_number, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Data transactions
    supabase
      .from('data_transactions')
      .select('id, amount, network, plan_name, status, reference, phone_number, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Electricity transactions
    supabase
      .from('electricity_transactions')
      .select('id, amount, provider, status, reference, meter_number, created_at, customer_name')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Education transactions
    supabase
      .from('education_transactions')
      .select('id, amount, exam_type, status, reference, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Betting transactions
    supabase
      .from('betting_transactions')
      .select('id, amount, betting_provider, status, reference, account_number, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Transfers sent
    supabase
      .from('transfer_transactions')
      .select('id, amount, status, reference, description, created_at, recipient:profiles!transfer_transactions_recipient_id_fkey(full_name, email)')
      .eq('sender_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Transfers received
    supabase
      .from('transfer_transactions')
      .select('id, amount, status, reference, description, created_at, sender:profiles!transfer_transactions_sender_id_fkey(full_name, email)')
      .eq('recipient_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),

    // Funding transactions
    supabase
      .from('funding_transactions')
      .select('id, amount, status, reference, description, created_at, payment_method')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true }),
  ]);

  // Combine and format all transactions
  const combined: TransactionData[] = [
    ...(userTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: txn.description || txn.transaction_type,
      type: txn.transaction_type === 'credit' ? 'credit' : 'debit',
      amount: txn.amount,
      balanceAfter: txn.balance_after || 0,
      reference: txn.reference || '',
      category: 'Wallet',
    })),
    ...(airtimeTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Airtime Purchase - ${txn.network} ${txn.phone_number}`,
      type: 'debit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Airtime',
    })),
    ...(dataTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Data Purchase - ${txn.network} ${txn.plan_name}`,
      type: 'debit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Data',
    })),
    ...(electricityTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Electricity - ${txn.provider} ${txn.meter_number || ''}`,
      type: 'debit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Electricity',
    })),
    ...(educationTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Education - ${txn.exam_type}`,
      type: 'debit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Education',
    })),
    ...(bettingTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Betting - ${txn.betting_provider} ${txn.account_number || ''}`,
      type: 'debit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Betting',
    })),
    ...(transfersSent.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Transfer to ${(txn.recipient as any)?.full_name || (txn.recipient as any)?.email || 'User'}`,
      type: 'debit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Transfer',
    })),
    ...(transfersReceived.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Transfer from ${(txn.sender as any)?.full_name || (txn.sender as any)?.email || 'User'}`,
      type: 'credit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Transfer',
    })),
    ...(fundingTxns.data || []).map((txn) => ({
      id: txn.id,
      date: txn.created_at,
      description: `Account Funding - ${txn.payment_method || 'Payment'}`,
      type: 'credit',
      amount: txn.amount,
      balanceAfter: 0,
      reference: txn.reference || '',
      category: 'Funding',
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return combined;
}

/**
 * Gets the opening balance (balance before the statement period)
 */
async function getOpeningBalance(userId: string, startDate: Date): Promise<number> {
  // Get the last transaction before the start date
  const { data: lastTxn } = await supabase
    .from('user_transactions')
    .select('balance_after')
    .eq('user_id', userId)
    .lt('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTxn?.balance_after !== undefined && lastTxn.balance_after !== null) {
    return lastTxn.balance_after;
  }

  // If no transaction found, get current balance from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .maybeSingle();

  return profile?.balance || 0;
}

/**
 * Gets user profile information
 */
async function getUserProfile(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, balance')
    .eq('id', userId)
    .maybeSingle();

  return profile;
}

/**
 * Formats currency for display
 */
function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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
  align: 'left' | 'center' | 'right' = 'left',
  padding: number = 5
) {
  // Calculate text position based on alignment
  let textX = x + padding;
  if (align === 'center') {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    textX = x + (width - textWidth) / 2;
  } else if (align === 'right') {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    textX = x + width - textWidth - padding;
  }

  // Draw cell borders
  // Top border
  drawLine(page, x, y, width);
  // Bottom border
  drawLine(page, x, y - height, width);
  // Left border
  drawVerticalLine(page, x, y, height);
  // Right border
  drawVerticalLine(page, x + width, y, height);

  // Draw text (truncate if too long)
  const maxTextWidth = width - (padding * 2);
  let displayText = text;
  if (font.widthOfTextAtSize(text, fontSize) > maxTextWidth) {
    // Truncate text
    let truncated = text;
    while (font.widthOfTextAtSize(truncated + '...', fontSize) > maxTextWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    displayText = truncated + '...';
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
 * Draws a table row
 */
function drawTableRow(
  page: PDFPage,
  x: number,
  y: number,
  columns: Array<{ width: number; text: string; align?: 'left' | 'center' | 'right' }>,
  font: any,
  fontSize: number,
  textColor: any,
  rowHeight: number = 20,
  isHeader: boolean = false
) {
  let currentX = x;
  const boldFont = isHeader ? font : font;

  columns.forEach((col, index) => {
    drawTableCell(
      page,
      currentX,
      y,
      col.width,
      rowHeight,
      col.text,
      boldFont,
      fontSize,
      textColor,
      col.align || 'left'
    );
    currentX += col.width;
  });

  return y - rowHeight;
}

/**
 * Generates a comprehensive statement of account PDF
 */
export async function generateStatementPDF(options: StatementOptions): Promise<Uint8Array> {
  const { userId, startDate, endDate } = options;

  // Fetch user profile and transactions
  const [profile, transactions] = await Promise.all([
    getUserProfile(userId),
    fetchAllTransactions(userId, startDate, endDate),
  ]);

  const userName = options.userName || profile?.full_name || 'User';
  const userEmail = options.userEmail || profile?.email || '';
  const openingBalance = await getOpeningBalance(userId, startDate);
  
  // Calculate closing balance
  let runningBalance = openingBalance;
  const transactionsWithBalance = transactions.map((txn) => {
    if (txn.type === 'credit') {
      runningBalance += txn.amount;
    } else {
      runningBalance -= txn.amount;
    }
    return { ...txn, balanceAfter: runningBalance };
  });
  const closingBalance = runningBalance;

  // Calculate summary statistics
  const totalCredits = transactions.filter((t) => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
  const totalDebits = transactions.filter((t) => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();
  
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;
  const margin = 50;
  const contentWidth = width - (margin * 2);

  // Header
  page.drawText('NETPAY', {
    x: margin,
    y,
    size: 24,
    font: titleFont,
    color: rgb(1, 0.5, 0), // Orange color #FF7F00
  });

  page.drawText('STATEMENT OF ACCOUNT', {
    x: margin,
    y: y - 30,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  y -= 60;

  // Account Information
  page.drawText('Account Information', {
    x: margin,
    y,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 20;

  page.drawText(`Account Name: ${userName}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  page.drawText(`Email: ${userEmail}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  page.drawText(`Account Number: ${userId.slice(0, 8).toUpperCase()}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 20;

  // Statement Period
  page.drawText('Statement Period', {
    x: margin,
    y,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 20;

  page.drawText(
    `From: ${startDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    {
      x: margin,
      y,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0),
    }
  );
  y -= 15;

  page.drawText(
    `To: ${endDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    {
      x: margin,
      y,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0),
    }
  );
  y -= 30;

  // Opening Balance
  page.drawText(`Opening Balance: ${formatCurrency(openingBalance)}`, {
    x: margin,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 30;

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
    { width: colWidths.date, text: 'Date', align: 'left' as const },
    { width: colWidths.description, text: 'Description', align: 'left' as const },
    { width: colWidths.reference, text: 'Reference', align: 'left' as const },
    { width: colWidths.debit, text: 'Debit', align: 'right' as const },
    { width: colWidths.credit, text: 'Credit', align: 'right' as const },
    { width: colWidths.balance, text: 'Balance', align: 'right' as const },
  ];

  // Draw header row with background color
  page.drawRectangle({
    x: tableStartX,
    y: y - rowHeight,
    width: contentWidth,
    height: rowHeight,
    color: rgb(1, 0.5, 0), // Orange background
  });

  y = drawTableRow(
    currentPage,
    tableStartX,
    y,
    headerColumns,
    boldFont,
    9,
    rgb(1, 1, 1), // White text for header
    rowHeight,
    true
  );
  y -= 5;

  // Transactions rows
  for (const txn of transactionsWithBalance) {
    // Check if we need a new page
    if (y < 150) {
      // Draw summary line before new page
      drawLine(currentPage, tableStartX, y, contentWidth);
      y -= 10;
      
      // New page
      currentPage = pdfDoc.addPage([595, 842]);
      y = height - 50;
      
      // Redraw header on new page
      currentPage.drawRectangle({
        x: tableStartX,
        y: y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(1, 0.5, 0),
      });
      
      y = drawTableRow(
        currentPage,
        tableStartX,
        y,
        headerColumns,
        boldFont,
        9,
        rgb(1, 1, 1),
        rowHeight,
        true
      );
      y -= 5;
    }

    const txnDate = formatDate(txn.date);
    const description = txn.description;
    const reference = txn.reference || '-';

    const rowColumns = [
      { width: colWidths.date, text: txnDate, align: 'left' as const },
      { width: colWidths.description, text: description, align: 'left' as const },
      { width: colWidths.reference, text: reference, align: 'left' as const },
      {
        width: colWidths.debit,
        text: txn.type === 'debit' ? formatCurrency(txn.amount) : '-',
        align: 'right' as const,
      },
      {
        width: colWidths.credit,
        text: txn.type === 'credit' ? formatCurrency(txn.amount) : '-',
        align: 'right' as const,
      },
      { width: colWidths.balance, text: formatCurrency(txn.balanceAfter), align: 'right' as const },
    ];

    // Alternate row background color for better readability
    const isEvenRow = transactionsWithBalance.indexOf(txn) % 2 === 0;
    if (isEvenRow) {
      currentPage.drawRectangle({
        x: tableStartX,
        y: y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.98), // Light gray background
      });
    }

    const debitColor = txn.type === 'debit' ? rgb(0.9, 0.2, 0.2) : rgb(0, 0, 0);
    const creditColor = txn.type === 'credit' ? rgb(0.1, 0.7, 0.1) : rgb(0, 0, 0);

    // Draw row cells
    let cellX = tableStartX;
    
    // Date cell
    drawTableCell(currentPage, cellX, y, colWidths.date, rowHeight, txnDate, regularFont, 8, rgb(0, 0, 0), 'left');
    cellX += colWidths.date;
    
    // Description cell
    drawTableCell(currentPage, cellX, y, colWidths.description, rowHeight, description, regularFont, 8, rgb(0, 0, 0), 'left');
    cellX += colWidths.description;
    
    // Reference cell
    drawTableCell(currentPage, cellX, y, colWidths.reference, rowHeight, reference, regularFont, 8, rgb(0, 0, 0), 'left');
    cellX += colWidths.reference;
    
    // Debit cell
    drawTableCell(
      currentPage,
      cellX,
      y,
      colWidths.debit,
      rowHeight,
      txn.type === 'debit' ? formatCurrency(txn.amount) : '-',
      regularFont,
      8,
      debitColor,
      'right'
    );
    cellX += colWidths.debit;
    
    // Credit cell
    drawTableCell(
      currentPage,
      cellX,
      y,
      colWidths.credit,
      rowHeight,
      txn.type === 'credit' ? formatCurrency(txn.amount) : '-',
      regularFont,
      8,
      creditColor,
      'right'
    );
    cellX += colWidths.credit;
    
    // Balance cell
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
      'right'
    );

    y -= rowHeight;
  }

  // Draw closing line for table
  drawLine(currentPage, tableStartX, y, contentWidth);
  y -= 15;

  // Summary Section
  page.drawText('Summary', {
    x: margin,
    y,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 20;

  currentPage.drawText(`Total Credits: ${formatCurrency(totalCredits)}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  currentPage.drawText(`Total Debits: ${formatCurrency(totalDebits)}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  currentPage.drawText(`Net Amount: ${formatCurrency(totalCredits - totalDebits)}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  currentPage.drawText(`Number of Transactions: ${transactions.length}`, {
    x: margin,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  y -= 20;

  // Closing Balance
  currentPage.drawText(`Closing Balance: ${formatCurrency(closingBalance)}`, {
    x: margin,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 30;

  // Footer
  drawLine(currentPage, margin, y, contentWidth);
  y -= 15;

  currentPage.drawText('This is a computer-generated statement.', {
    x: margin,
    y,
    size: 8,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 12;

  currentPage.drawText('For inquiries, please contact support@netpayy.ng', {
    x: margin,
    y,
    size: 8,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 12;

  currentPage.drawText(`Generated on: ${new Date().toLocaleString('en-NG')}`, {
    x: margin,
    y,
    size: 8,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}
