import { Share } from 'react-native';
import {
  buildShareMessage,
  generateTransactionReceiptHtml,
  type TransactionReceiptPdf,
} from '@/utils/transaction-receipt-shared';

export type { ReceiptPdfRow, TransactionReceiptPdf } from '@/utils/transaction-receipt-shared';

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function shareOrDownloadPdfBlob(blob: Blob, input: TransactionReceiptPdf) {
  const fileName = input.fileName.endsWith('.pdf') ? input.fileName : `${input.fileName}.pdf`;
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  if (nav && typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({
        files: [file],
        title: input.title,
        text: buildShareMessage(input),
      });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    }
  }

  triggerBrowserDownload(blob, fileName);
}

/**
 * Web receipt share — always produce a PDF (never HTML).
 * Uses expo-print when available, otherwise opens the browser print dialog (Save as PDF).
 */
export async function shareTransactionReceiptPdf(input: TransactionReceiptPdf): Promise<void> {
  const html = generateTransactionReceiptHtml(input);

  try {
    const Print = await import('expo-print');

    if (typeof Print.printToFileAsync === 'function') {
      try {
        const result = await Print.printToFileAsync({
          html,
          base64: true,
          width: 595,
          height: 842,
        });

        if (result?.base64) {
          const binary = atob(result.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          await shareOrDownloadPdfBlob(new Blob([bytes], { type: 'application/pdf' }), input);
          return;
        }

        if (result?.uri) {
          const response = await fetch(result.uri);
          const blob = await response.blob();
          if (blob.type.includes('pdf') || blob.size > 0) {
            await shareOrDownloadPdfBlob(
              blob.type.includes('pdf') ? blob : new Blob([blob], { type: 'application/pdf' }),
              input,
            );
            return;
          }
        }
      } catch (printFileError) {
        console.warn('Web printToFileAsync unavailable, falling back to print dialog:', printFileError);
      }
    }

    // Browser "Save as PDF" — ensures a real PDF with the embedded NetPay logo.
    if (typeof Print.printAsync === 'function') {
      await Print.printAsync({ html });
      return;
    }
  } catch (error) {
    console.warn('expo-print web PDF failed, opening print window:', error);
  }

  if (typeof document !== 'undefined') {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      const triggerPrint = () => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // Keep the receipt tab open if print fails.
        }
      };
      printWindow.addEventListener('load', triggerPrint);
      setTimeout(triggerPrint, 400);
      return;
    }
  }

  await Share.share({ title: input.title, message: buildShareMessage(input) });
}
