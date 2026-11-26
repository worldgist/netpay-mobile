import { supabase } from '@/lib/supabase';

export type TransactionReportDetails = {
  title: string;
  category: string;
  amount: number;
  status: string;
  dateTime: string;
  reference?: string | null;
  transactionId: string;
  userMessage: string;
};

export function buildTransactionReportMessage(details: TransactionReportDetails) {
  const amount = `₦${details.amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return [
    'Transaction Report',
    '',
    `Title: ${details.title}`,
    `Category: ${details.category}`,
    `Amount: ${amount}`,
    `Status: ${details.status}`,
    `Date & Time: ${details.dateTime}`,
    `Reference: ${details.reference || 'N/A'}`,
    `Transaction ID: ${details.transactionId}`,
    '',
    'Issue reported by user:',
    details.userMessage,
  ].join('\n');
}

export async function submitTransactionReport(params: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const { data, error } = await supabase.functions.invoke('send-support-email', {
    body: params,
  });

  if (error) {
    throw error;
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to submit report');
  }

  try {
    await supabase.from('support_contact_submissions').insert({
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: params.message,
      channel: 'transaction_report',
    });
  } catch (insertError) {
    console.warn('support_contact_submissions insert failed:', insertError);
  }

  return data;
}
