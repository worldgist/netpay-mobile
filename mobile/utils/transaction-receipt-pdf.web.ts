import { Share } from 'react-native';
import {
  buildShareMessage,
  generateTransactionReceiptHtml,
  type TransactionReceiptPdf,
} from '@/utils/transaction-receipt-shared';

export type { ReceiptPdfRow, TransactionReceiptPdf } from '@/utils/transaction-receipt-shared';

export async function shareTransactionReceiptPdf(input: TransactionReceiptPdf): Promise<void> {
  const html = generateTransactionReceiptHtml(input);
  const fileName = input.fileName.endsWith('.pdf')
    ? input.fileName.replace(/\.pdf$/i, '.html')
    : `${input.fileName}.html`;

  if (typeof document !== 'undefined') {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const file = new File([blob], fileName, { type: 'text/html' });
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;

    if (nav && typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({ files: [file], title: input.title, text: buildShareMessage(input) });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (printWindow) {
      const triggerPrint = () => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // Ignore print failures; the receipt tab remains open.
        }
      };
      printWindow.addEventListener('load', triggerPrint);
      setTimeout(triggerPrint, 500);
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  await Share.share({ title: input.title, message: buildShareMessage(input) });
}
