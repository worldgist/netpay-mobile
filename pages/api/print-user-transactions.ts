import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
// import PDFDocument from 'pdfkit';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
// import nodemailer from 'nodemailer';
import stream from 'stream';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to send email with PDF attachment or link using RESEND API
async function sendStatementEmail({ to, pdfBuffer, downloadUrl }: { to: string, pdfBuffer?: Buffer, downloadUrl?: string }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'NetPay Notifications <support@netpayy.ng>';
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is not configured');

  let attachments = [];
  if (pdfBuffer) {
    // Convert Buffer to base64 string
    const pdfBase64 = pdfBuffer.toString('base64');
    attachments.push({
      filename: 'statement.pdf',
      content: pdfBase64,
    });
  }

  const emailPayload: any = {
    from: FROM_ADDRESS,
    to: [to],
    subject: 'Your Netpay Statement of Account',
    text: downloadUrl
      ? `Your statement is ready. Download: ${downloadUrl}`
      : 'Your statement is attached as a PDF.',
    html: downloadUrl
      ? `<p>Your statement is ready. <a href="${downloadUrl}">Download here</a></p>`
      : '<p>Your statement is attached as a PDF.</p>',
    tags: [
      { name: 'notification_type', value: 'statement' },
    ],
  };
  if (attachments.length > 0) {
    emailPayload.attachments = attachments;
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('Resend API error:', errorText);
    throw new Error('Failed to send email via RESEND');
  }
  return await resendResponse.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { user_id } = req.query;
  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'Missing user_id' });
    return;
  }

  const { start, end, send_email, email } = req.query;

  // Date filtering
  let filtered = supabase
    .from('user_transactions')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false });
  if (start && typeof start === 'string') filtered = filtered.gte('created_at', start);
  if (end && typeof end === 'string') filtered = filtered.lte('created_at', end);

  const { data: transactions, error } = await filtered;

  if (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
    return;
  }

  // Generate PDF using pdf-lib
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = height - 50;

  // Title
  page.drawText('User Transactions', {
    x: 50,
    y,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0.7),
  });
  y -= 40;

  if (!transactions || transactions.length === 0) {
    page.drawText('No transactions found for this user.', {
      x: 50,
      y,
      size: 14,
      font: regularFont,
      color: rgb(0.5, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);
    if (send_email && email) {
      await sendStatementEmail({ to: email as string, pdfBuffer });
      res.status(200).json({ success: true, message: 'Statement sent to email.' });
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="transactions-${user_id}.pdf"`);
      res.end(pdfBuffer);
    }
    return;
  }

  page.drawText(`Total Transactions: ${transactions.length}`, {
    x: 50,
    y,
    size: 12,
    font: regularFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 30;

  for (const tx of transactions) {
    if (y < 100) {
      y = height - 50;
      pdfDoc.addPage([595, 842]);
    }
    page.drawText(`Date: ${new Date(tx.created_at).toLocaleString()}`, { x: 50, y, size: 10, font: regularFont, color: rgb(0,0,0) });
    y -= 15;
    page.drawText(`Type: ${tx.transaction_type}`, { x: 50, y, size: 10, font: regularFont, color: rgb(0,0,0) });
    y -= 15;
    page.drawText(`Amount: ₦${tx.amount}`, { x: 50, y, size: 10, font: regularFont, color: rgb(0,0,0) });
    y -= 15;
    page.drawText(`Description: ${tx.description || ''}`, { x: 50, y, size: 10, font: regularFont, color: rgb(0,0,0) });
    y -= 15;
    page.drawText(`Reference: ${tx.reference || ''}`, { x: 50, y, size: 10, font: regularFont, color: rgb(0,0,0) });
    y -= 15;
    page.drawText(`Balance After: ₦${tx.balance_after}`, { x: 50, y, size: 10, font: regularFont, color: rgb(0,0,0) });
    y -= 25;
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  if (send_email && email) {
    await sendStatementEmail({ to: email as string, pdfBuffer });
    res.status(200).json({ success: true, message: 'Statement sent to email.' });
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${user_id}.pdf"`);
    res.end(pdfBuffer);
  }
  return;
}
