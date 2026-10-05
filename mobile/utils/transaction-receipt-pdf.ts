import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type ReceiptPdfRow = {
  label: string;
  value: string;
};

export type TransactionReceiptPdf = {
  title: string;
  amountText: string;
  status: string;
  rows: ReceiptPdfRow[];
  fileName: string;
};

function pdfSafe(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = pdfSafe(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function buildTransactionReceiptPdf(input: TransactionReceiptPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(1, 0.498, 0);
  const navy = rgb(0.102, 0.169, 0.29);
  const muted = rgb(0.4, 0.44, 0.5);
  const line = rgb(0.93, 0.91, 0.88);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  page.drawRectangle({ x: 0, y: pageHeight - 118, width: pageWidth, height: 118, color: orange });
  page.drawText('NETPAY', { x: margin, y: pageHeight - 42, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText('TRANSACTION RECEIPT', {
    x: margin,
    y: pageHeight - 64,
    size: 11,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const titleLines = wrapText(input.title, bold, 16, contentWidth);
  let titleY = pageHeight - 92;
  for (const titleLine of titleLines.slice(0, 2)) {
    page.drawText(titleLine, { x: margin, y: titleY, size: 16, font: bold, color: rgb(1, 1, 1) });
    titleY -= 18;
  }

  let y = pageHeight - 156;
  page.drawText(pdfSafe(input.amountText) || 'NGN 0.00', {
    x: margin,
    y,
    size: 22,
    font: bold,
    color: navy,
  });
  y -= 22;
  page.drawText(pdfSafe(input.status) || 'Completed', {
    x: margin,
    y,
    size: 12,
    font: bold,
    color: orange,
  });
  y -= 28;

  const rows = input.rows.filter((row) => pdfSafe(row.value));
  for (const row of rows) {
    const valueLines = wrapText(row.value, bold, 12, contentWidth);
    const rowHeight = 34 + Math.max(valueLines.length, 1) * 16;
    if (y - rowHeight < 72) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - 48;
    }
    page.drawText(pdfSafe(row.label).toUpperCase(), {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: orange,
    });
    let valueY = y - 18;
    for (const valueLine of valueLines) {
      page.drawText(valueLine, { x: margin, y: valueY, size: 12, font: bold, color: navy });
      valueY -= 16;
    }
    const lineY = y - rowHeight + 10;
    page.drawLine({
      start: { x: margin, y: lineY },
      end: { x: pageWidth - margin, y: lineY },
      thickness: 1,
      color: line,
    });
    y = lineY - 16;
  }

  if (y < 80) {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 48;
  }
  page.drawText('NetPay', { x: margin, y, size: 12, font: bold, color: navy });
  page.drawText('support@netppay.com', { x: margin, y: y - 16, size: 10, font: regular, color: muted });
  page.drawText('www.netppay.com', { x: margin, y: y - 30, size: 10, font: regular, color: muted });

  return pdf.save();
}

async function sharePdfWeb(bytes: Uint8Array, fileName: string, title: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      throw error;
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function shareTransactionReceiptPdf(input: TransactionReceiptPdf): Promise<void> {
  const bytes = await buildTransactionReceiptPdf(input);
  const fileName = input.fileName.endsWith('.pdf') ? input.fileName : `${input.fileName}.pdf`;

  if (Platform.OS === 'web') {
    await sharePdfWeb(bytes, fileName, input.title);
    return;
  }

  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('Receipt storage is not available');
  }

  const fileUri = `${directory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Transaction Receipt',
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  await Share.share({ title: input.title, url: fileUri });
}
