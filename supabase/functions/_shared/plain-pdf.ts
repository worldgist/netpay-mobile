export type PlainReceipt = {
  title: string;
  subtitle?: string;
  highlightLabel?: string;
  highlightValue?: string;
  rows: Array<[string, string]>;
  footer: string[];
};

function pdfSafe(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function escapePdfText(value: string): string {
  return pdfSafe(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxChars: number): string[] {
  const words = pdfSafe(value).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function text(font: "F1" | "F2", size: number, x: number, y: number, value: string): string {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`;
}

export function buildPlainReceiptPdf(receipt: PlainReceipt): Uint8Array {
  const commands: string[] = [
    "1 0.498 0 rg",
    "0 748 595 94 re f",
    "1 1 1 rg",
    text("F2", 22, 40, 804, "NETPAY"),
    text("F1", 12, 40, 778, receipt.title),
  ];

  let y = 720;
  commands.push("0.42 0.45 0.5 rg");
  for (const line of wrapText(receipt.subtitle || "", 88)) {
    commands.push(text("F1", 11, 40, y, line));
    y -= 16;
  }

  if (receipt.highlightValue) {
    y -= 8;
    const tokenLines = wrapText(receipt.highlightValue, 42);
    const boxHeight = 48 + tokenLines.length * 22;
    const boxBottom = y - boxHeight + 18;
    commands.push("1 0.973 0.953 rg");
    commands.push(`40 ${boxBottom} 515 ${boxHeight} re f`);
    commands.push("1 0.498 0 rg");
    commands.push(text("F2", 10, 56, y, receipt.highlightLabel || "DETAILS"));
    commands.push("0.106 0.141 0.188 rg");
    let tokenY = y - 26;
    for (const line of tokenLines) {
      commands.push(text("F2", 16, 56, tokenY, line));
      tokenY -= 22;
    }
    y = boxBottom - 22;
  }

  for (const [label, value] of receipt.rows) {
    if (!value) continue;
    const valueLines = wrapText(value, 72);
    if (valueLines.length === 0) continue;
    if (y < 96) break;
    commands.push("1 0.498 0 rg");
    commands.push(text("F2", 9, 40, y, label));
    commands.push("0.106 0.141 0.188 rg");
    y -= 16;
    for (const line of valueLines) {
      commands.push(text("F2", 12, 40, y, line));
      y -= 16;
    }
    commands.push("0.93 0.93 0.93 RG");
    commands.push(`40 ${y + 6} m 555 ${y + 6} l S`);
    y -= 14;
  }

  y -= 6;
  commands.push("0.2 0.2 0.2 rg");
  commands.push(text("F2", 11, 40, y, "NetPay"));
  y -= 16;
  commands.push("0.42 0.45 0.5 rg");
  for (const line of receipt.footer) {
    if (y < 40) break;
    commands.push(text("F1", 10, 40, y, line));
    y -= 14;
  }

  return encodePdf(commands.join("\n"));
}

function encodePdf(stream: string): Uint8Array {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }

  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body + xref + trailer);
}
