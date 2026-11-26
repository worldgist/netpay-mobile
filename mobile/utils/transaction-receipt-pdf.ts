import { Share } from 'react-native';
import {
  buildShareMessage,
  generateTransactionReceiptHtml,
  type TransactionReceiptPdf,
} from '@/utils/transaction-receipt-shared';

export type { ReceiptPdfRow, TransactionReceiptPdf } from '@/utils/transaction-receipt-shared';

export async function shareTransactionReceiptPdf(input: TransactionReceiptPdf): Promise<void> {
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const FileSystem = await import('expo-file-system/legacy');

    const html = generateTransactionReceiptHtml(input);
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
      width: 595,
      height: 842,
    });

    const fileName = input.fileName.endsWith('.pdf') ? input.fileName : `${input.fileName}.pdf`;
    const targetUri = `${FileSystem.cacheDirectory || ''}${fileName}`;
    let fileUri = uri;

    if (FileSystem.cacheDirectory && uri !== targetUri) {
      await FileSystem.copyAsync({ from: uri, to: targetUri });
      fileUri = targetUri;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Transaction Receipt',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({ title: input.title, url: fileUri, message: buildShareMessage(input) });
  } catch (error) {
    console.error('Native receipt share failed, falling back to text:', error);
    await Share.share({ title: input.title, message: buildShareMessage(input) });
  }
}
