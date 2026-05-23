import { generateStatementPDF } from '../../utils/generate-statement';

/** Minimal request/response shapes for this handler (standalone; not wired to Next.js in this Vite app). */
type ApiRequest = {
  query: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(chunk?: Buffer): void;
};

// Helper to send email with PDF attachment using RESEND API
async function sendStatementEmail({ to, pdfBuffer }: { to: string, pdfBuffer: Buffer }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'NetPay Notifications <support@netpayy.ng>';
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is not configured');

  const pdfBase64 = pdfBuffer.toString('base64');
  const attachments = [{
    filename: 'statement.pdf',
    content: pdfBase64,
  }];

  const emailPayload: any = {
    from: FROM_ADDRESS,
    to: [to],
    subject: 'Your Netpay Statement',
    text: 'Your statement is attached as a PDF.',
    html: '<p>Your statement is attached as a PDF.</p>',
    tags: [
      { name: 'notification_type', value: 'statement' },
    ],
    attachments,
  };

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const { user_id } = req.query;
  if (!user_id || typeof user_id !== 'string') {
    res.status(400).json({ error: 'Missing user_id' });
    return;
  }

  const { start, end, send_email, email } = req.query;

  // Parse dates or use defaults
  const startDate = start && typeof start === 'string' ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days ago
  const endDate = end && typeof end === 'string' ? new Date(end) : new Date(); // Default to today

  try {
    // Generate comprehensive statement PDF
    const pdfBytes = await generateStatementPDF({
      userId: user_id,
      startDate,
      endDate,
      userEmail: email as string | undefined,
    });

    const pdfBuffer = Buffer.from(pdfBytes);

    if (send_email && email) {
      await sendStatementEmail({ to: email as string, pdfBuffer });
      res.status(200).json({ success: true, message: 'Statement sent to email.' });
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="statement-${user_id}-${Date.now()}.pdf"`);
      res.end(pdfBuffer);
    }
  } catch (error) {
    console.error('Error generating statement:', error);
    res.status(500).json({ 
      error: 'Failed to generate statement',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
