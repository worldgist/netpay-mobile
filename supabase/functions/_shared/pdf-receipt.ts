import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

export type ReceiptType = "electricity" | "education" | "airtime";

export interface BaseReceiptData {
  userEmail: string;
  userName?: string;
  amount: number;
  reference: string;
  purchasedAt: string;
  balanceBefore: number;
  balanceAfter: number;
}

export interface ElectricityReceiptData extends BaseReceiptData {
  type: "electricity";
  provider: string;
  meterNumber: string;
  meterType?: string;
  customerName?: string;
  customerAddress?: string;
  customerId?: string;
  token: string;
  units?: number;
  chargeFee?: number;
  purchaseAmount?: number;
}

export interface EducationReceiptData extends BaseReceiptData {
  type: "education";
  examType: string;
  pin: string;
  serial?: string;
  pins?: Array<{ Pin: string; Serial?: string }>;
  phoneNumber?: string;
  chargeFee?: number;
  purchaseAmount?: number;
}

export interface AirtimeReceiptData extends BaseReceiptData {
  type: "airtime";
  network: string;
  phoneNumber: string;
}

export type ReceiptData = ElectricityReceiptData | EducationReceiptData | AirtimeReceiptData;

const formatCurrency = (amount: number): string => {
  const formatted = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `NGN ${formatted}`;
};

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-NG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
};

const ELECTRICITY_PROVIDER_LABELS: Record<string, string> = {
  ABUJA: "ABUJA ELECTRICITY DISTRIBUTION COMPANY (AEDC)",
  AEDC: "ABUJA ELECTRICITY DISTRIBUTION COMPANY (AEDC)",
  IKEJA: "IKEJA ELECTRICITY DISTRIBUTION COMPANY (IKEDC)",
  IKEDC: "IKEJA ELECTRICITY DISTRIBUTION COMPANY (IKEDC)",
  EKO: "EKO ELECTRICITY DISTRIBUTION COMPANY (EKEDC)",
  EKEDC: "EKO ELECTRICITY DISTRIBUTION COMPANY (EKEDC)",
  KADUNA: "KADUNA ELECTRICITY DISTRIBUTION COMPANY (KAEDCO)",
  KAEDC: "KADUNA ELECTRICITY DISTRIBUTION COMPANY (KAEDCO)",
  KAEDCO: "KADUNA ELECTRICITY DISTRIBUTION COMPANY (KAEDCO)",
  IBADAN: "IBADAN ELECTRICITY DISTRIBUTION COMPANY (IBEDC)",
  IBEDC: "IBADAN ELECTRICITY DISTRIBUTION COMPANY (IBEDC)",
  KANO: "KANO ELECTRICITY DISTRIBUTION COMPANY (KEDCO)",
  KEDCO: "KANO ELECTRICITY DISTRIBUTION COMPANY (KEDCO)",
  PORTHARCOURT: "PORT HARCOURT ELECTRICITY DISTRIBUTION COMPANY (PHED)",
  "PORT-HARCOURT": "PORT HARCOURT ELECTRICITY DISTRIBUTION COMPANY (PHED)",
  PHED: "PORT HARCOURT ELECTRICITY DISTRIBUTION COMPANY (PHED)",
  PHEDC: "PORT HARCOURT ELECTRICITY DISTRIBUTION COMPANY (PHED)",
  JOS: "JOS ELECTRICITY DISTRIBUTION COMPANY (JED)",
  JED: "JOS ELECTRICITY DISTRIBUTION COMPANY (JED)",
  BENIN: "BENIN ELECTRICITY DISTRIBUTION COMPANY (BEDC)",
  BEDC: "BENIN ELECTRICITY DISTRIBUTION COMPANY (BEDC)",
  YOLA: "YOLA ELECTRICITY DISTRIBUTION COMPANY (YEDC)",
  YEDC: "YOLA ELECTRICITY DISTRIBUTION COMPANY (YEDC)",
  ENUGU: "ENUGU ELECTRICITY DISTRIBUTION COMPANY (EEDC)",
  EEDC: "ENUGU ELECTRICITY DISTRIBUTION COMPANY (EEDC)",
  ABA: "ABA ELECTRICITY DISTRIBUTION COMPANY (ABEDC)",
};

function pdfSafe(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function wrapPdfText(
  text: string,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = pdfSafe(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
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

function displayElectricityProvider(provider: string): string {
  const key = provider.trim().toUpperCase().replace(/\s+/g, "");
  return ELECTRICITY_PROVIDER_LABELS[key] || provider.trim().toUpperCase();
}

function formatElectricityToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed || trimmed.toLowerCase() === "processing...") return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return trimmed;
  return (digits.match(/.{1,4}/g) || [trimmed]).join(" - ");
}

function formatReceiptDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${pick("day")} ${pick("month")} ${pick("year")}, ${pick("hour")}:${pick("minute")}`;
  } catch {
    return formatDate(value);
  }
}

async function generateElectricityReceiptPDF(data: ElectricityReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(1, 0.478, 0);
  const white = rgb(1, 1, 1);
  const ink = rgb(0.106, 0.141, 0.188);
  const muted = rgb(0.42, 0.447, 0.502);
  const cream = rgb(1, 0.965, 0.933);
  const lineColor = rgb(0.953, 0.906, 0.863);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let logoImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try {
    const logoResponse = await fetch("https://www.netppay.com/logo.png");
    if (logoResponse.ok) {
      logoImage = await pdfDoc.embedPng(new Uint8Array(await logoResponse.arrayBuffer()));
    }
  } catch (error) {
    console.error("Electricity receipt logo skipped:", error);
  }

  const logoWidth = 150;
  const logoHeight = logoImage ? (logoImage.height / logoImage.width) * logoWidth : 0;
  const badgeHeight = logoImage ? logoHeight + 12 : 52;
  const headerHeight = 36 + badgeHeight + 92;
  page.drawRectangle({
    x: 0,
    y: pageHeight - headerHeight,
    width: pageWidth,
    height: headerHeight,
    color: orange,
  });

  const badgeY = pageHeight - 24 - badgeHeight;
  if (logoImage) {
    page.drawRectangle({
      x: margin,
      y: badgeY,
      width: logoWidth + 16,
      height: badgeHeight,
      color: white,
    });
    page.drawImage(logoImage, {
      x: margin + 8,
      y: badgeY + 6,
      width: logoWidth,
      height: logoHeight,
    });
    page.drawText("BILL PAYMENTS MADE EASY", {
      x: margin + logoWidth + 32,
      y: badgeY + badgeHeight / 2 - 4,
      size: 8,
      font: boldFont,
      color: white,
    });
  } else {
    page.drawText("NETPAY", {
      x: margin,
      y: badgeY + 24,
      size: 22,
      font: boldFont,
      color: white,
    });
    page.drawText("BILL PAYMENTS MADE EASY", {
      x: margin,
      y: badgeY + 8,
      size: 9,
      font: boldFont,
      color: white,
    });
  }

  const titleY = badgeY - 36;
  page.drawText("Electricity Token", {
    x: margin,
    y: titleY,
    size: 24,
    font: boldFont,
    color: white,
  });
  page.drawText("Purchase Successful", {
    x: margin,
    y: titleY - 30,
    size: 24,
    font: boldFont,
    color: white,
  });

  let y = pageHeight - headerHeight - 28;
  for (const line of wrapPdfText(
    "Your electricity token has been successfully generated and your payment was completed.",
    regularFont,
    11,
    contentWidth,
  )) {
    page.drawText(line, { x: margin, y, size: 11, font: regularFont, color: muted });
    y -= 15;
  }

  y -= 14;
  const tokenText = pdfSafe(formatElectricityToken(data.token || "Processing..."));
  const tokenLines = wrapPdfText(tokenText, boldFont, 16, contentWidth - 32);
  const boxHeight = 72 + tokenLines.length * 20;
  page.drawRectangle({
    x: margin,
    y: y - boxHeight,
    width: contentWidth,
    height: boxHeight,
    color: cream,
  });
  page.drawText("ELECTRICITY TOKEN", {
    x: margin + 16,
    y: y - 20,
    size: 10,
    font: boldFont,
    color: orange,
  });
  let tokenY = y - 44;
  for (const line of tokenLines) {
    page.drawText(line, { x: margin + 16, y: tokenY, size: 16, font: boldFont, color: ink });
    tokenY -= 20;
  }
  page.drawText("Enter this token on your meter to load your electricity.", {
    x: margin + 16,
    y: tokenY + 4,
    size: 10,
    font: regularFont,
    color: muted,
  });
  y = y - boxHeight - 22;

  const meterType = data.meterType
    ? data.meterType.charAt(0).toUpperCase() + data.meterType.slice(1).toLowerCase()
    : "";
  const rows: Array<[string, string]> = [];
  if (data.customerName) rows.push(["CUSTOMER NAME", data.customerName]);
  if (data.customerId) rows.push(["CUSTOMER ID", data.customerId]);
  rows.push(["PROVIDER", displayElectricityProvider(data.provider)]);
  rows.push(["METER NUMBER", data.meterNumber]);
  if (meterType) rows.push(["METER TYPE", meterType]);
  rows.push(["AMOUNT PAID", formatCurrency(data.amount)]);
  if (typeof data.units === "number" && !Number.isNaN(data.units)) {
    rows.push(["UNITS", `${data.units.toFixed(2)} kWh`]);
  }
  if (data.purchasedAt) rows.push(["PURCHASED", formatReceiptDate(data.purchasedAt)]);
  if (data.reference) rows.push(["REFERENCE", data.reference]);
  if (data.customerAddress) rows.push(["CUSTOMER ADDRESS", data.customerAddress]);

  for (const [label, value] of rows) {
    const valueLines = wrapPdfText(value, boldFont, 12, contentWidth);
    const rowHeight = 34 + Math.max(valueLines.length, 1) * 16;
    if (y - rowHeight < 88) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 48;
    }
    page.drawText(label, { x: margin, y, size: 9, font: boldFont, color: orange });
    let valueY = y - 18;
    for (const line of valueLines) {
      page.drawText(line, { x: margin, y: valueY, size: 12, font: boldFont, color: ink });
      valueY -= 16;
    }
    const lineY = y - rowHeight + 10;
    page.drawLine({
      start: { x: margin, y: lineY },
      end: { x: pageWidth - margin, y: lineY },
      thickness: 1,
      color: lineColor,
    });
    y = lineY - 16;
  }

  if (y < 80) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - 48;
  }
  page.drawText("NetPay", { x: margin, y, size: 12, font: boldFont, color: ink });
  page.drawText("support@netppay.com", { x: margin, y: y - 16, size: 10, font: regularFont, color: muted });
  page.drawText("www.netppay.com", { x: margin, y: y - 30, size: 10, font: regularFont, color: muted });

  return pdfDoc.save();
}

export async function generateReceiptPDF(data: ReceiptData): Promise<Uint8Array> {
  if (data.type === "electricity") {
    return generateElectricityReceiptPDF(data);
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  // Colors
  const orange = rgb(1, 0.498, 0);
  const darkGray = rgb(0.2, 0.2, 0.2);
  const lightGray = rgb(0.7, 0.7, 0.7);
  const black = rgb(0, 0, 0);

  // Fonts
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let yPosition = height - 80;

  // Header
  page.drawRectangle({
    x: 0,
    y: height - 60,
    width: width,
    height: 60,
    color: orange,
  });

  page.drawText("NetPay", {
    x: 50,
    y: height - 35,
    size: 28,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText("Transaction Receipt", {
    x: 50,
    y: height - 55,
    size: 12,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

  yPosition -= 40;

  // Receipt Type Title
  const receiptTitle = data.type === "electricity" 
    ? "Electricity Token Purchase"
    : data.type === "education"
    ? `${data.examType.toUpperCase()} PIN Purchase`
    : "Airtime Purchase";

  page.drawText(receiptTitle, {
    x: 50,
    y: yPosition,
    size: 18,
    font: boldFont,
    color: darkGray,
  });

  yPosition -= 30;

  // User Information
  if (data.userName) {
    page.drawText(`Customer: ${data.userName}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;
  }

  page.drawText(`Email: ${data.userEmail}`, {
    x: 50,
    y: yPosition,
    size: 11,
    font: regularFont,
    color: darkGray,
  });

  yPosition -= 30;

  // Transaction Details Section
  page.drawRectangle({
    x: 50,
    y: yPosition - 10,
    width: width - 100,
    height: 2,
    color: orange,
  });

  yPosition -= 25;

  if (data.type === "electricity") {
    // Electricity-specific details
    page.drawText(`Provider: ${data.provider}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;

    page.drawText(`Meter Number: ${data.meterNumber}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;

    if (data.meterType) {
      page.drawText(`Meter Type: ${data.meterType}`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: darkGray,
      });
      yPosition -= 20;
    }

    if (data.customerName) {
      page.drawText(`Customer Name: ${data.customerName}`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: darkGray,
      });
      yPosition -= 20;
    }

    if (data.customerId) {
      page.drawText(`Customer ID: ${data.customerId}`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: darkGray,
      });
      yPosition -= 20;
    }

    if (data.customerAddress) {
      page.drawText(`Address: ${data.customerAddress.slice(0, 90)}`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: darkGray,
      });
      yPosition -= 20;
    }

    yPosition -= 10;

    // Token (highlighted)
    page.drawRectangle({
      x: 50,
      y: yPosition - 30,
      width: width - 100,
      height: 40,
      color: rgb(1, 0.9, 0.8),
      borderColor: orange,
      borderWidth: 2,
    });

    page.drawText("TOKEN:", {
      x: 60,
      y: yPosition - 10,
      size: 10,
      font: boldFont,
      color: darkGray,
    });

    page.drawText(data.token, {
      x: 60,
      y: yPosition - 25,
      size: 16,
      font: boldFont,
      color: orange,
    });

    yPosition -= 50;

    if (data.units) {
      page.drawText(`Units: ${data.units.toFixed(2)} kWh`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: darkGray,
      });
      yPosition -= 20;
    }
  } else if (data.type === "education") {
    const pinEntries = (Array.isArray(data.pins) && data.pins.length > 0
      ? data.pins
      : data.pin
        ? [{ Pin: data.pin, Serial: data.serial }]
        : []
    ).filter((entry) => entry.Pin?.trim());

    // Education-specific details
    page.drawText(`Exam Type: ${data.examType.toUpperCase()}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;

    yPosition -= 10;

    for (let index = 0; index < pinEntries.length; index++) {
      const entry = pinEntries[index];
      const pinLabel = pinEntries.length > 1 ? `PIN ${index + 1}:` : "PIN:";

      page.drawRectangle({
        x: 50,
        y: yPosition - 30,
        width: width - 100,
        height: 40,
        color: rgb(1, 0.9, 0.8),
        borderColor: orange,
        borderWidth: 2,
      });

      page.drawText(pinLabel, {
        x: 60,
        y: yPosition - 10,
        size: 10,
        font: boldFont,
        color: darkGray,
      });

      page.drawText(entry.Pin, {
        x: 60,
        y: yPosition - 25,
        size: 16,
        font: boldFont,
        color: orange,
      });

      yPosition -= 50;

      if (entry.Serial) {
        page.drawRectangle({
          x: 50,
          y: yPosition - 30,
          width: width - 100,
          height: 40,
          color: rgb(1, 0.9, 0.8),
          borderColor: orange,
          borderWidth: 2,
        });

        page.drawText(pinEntries.length > 1 ? `SERIAL ${index + 1}:` : "SERIAL NUMBER:", {
          x: 60,
          y: yPosition - 10,
          size: 10,
          font: boldFont,
          color: darkGray,
        });

        page.drawText(entry.Serial, {
          x: 60,
          y: yPosition - 25,
          size: 14,
          font: boldFont,
          color: orange,
        });

        yPosition -= 50;
      }
    }

    if (data.phoneNumber) {
      page.drawText(`Phone Number: ${data.phoneNumber}`, {
        x: 50,
        y: yPosition,
        size: 11,
        font: regularFont,
        color: darkGray,
      });
      yPosition -= 20;
    }
  } else if (data.type === "airtime") {
    // Airtime-specific details
    page.drawText(`Network: ${data.network}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;

    page.drawText(`Phone Number: ${data.phoneNumber}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 30;
  }

  // Payment Summary
  page.drawRectangle({
    x: 50,
    y: yPosition - 10,
    width: width - 100,
    height: 2,
    color: lightGray,
  });

  yPosition -= 25;

  page.drawText("Payment Summary", {
    x: 50,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: darkGray,
  });

  yPosition -= 25;

  const purchaseAmount = (data as any).purchaseAmount || data.amount;
  const chargeFee = (data as any).chargeFee || 0;

  if (chargeFee > 0 && purchaseAmount !== data.amount) {
    page.drawText(`Purchase Amount: ${formatCurrency(purchaseAmount)}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;

    page.drawText(`Service Charge: ${formatCurrency(chargeFee)}`, {
      x: 50,
      y: yPosition,
      size: 11,
      font: regularFont,
      color: darkGray,
    });
    yPosition -= 20;
  }

  page.drawText(`Total Amount: ${formatCurrency(data.amount)}`, {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: darkGray,
  });

  yPosition -= 30;

  page.drawText(`Balance Before: ${formatCurrency(data.balanceBefore)}`, {
    x: 50,
    y: yPosition,
    size: 11,
    font: regularFont,
    color: darkGray,
  });
  yPosition -= 20;

  page.drawText(`Balance After: ${formatCurrency(data.balanceAfter)}`, {
    x: 50,
    y: yPosition,
    size: 11,
    font: regularFont,
    color: darkGray,
  });

  yPosition -= 30;

  // Reference and Date
  page.drawText(`Reference: ${data.reference}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: regularFont,
    color: lightGray,
  });
  yPosition -= 18;

  page.drawText(`Date: ${formatDate(data.purchasedAt)}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: regularFont,
    color: lightGray,
  });

  // Footer
  const footerY = 50;
  page.drawRectangle({
    x: 50,
    y: footerY - 2,
    width: width - 100,
    height: 2,
    color: orange,
  });

  page.drawText("Thank you for using NetPay!", {
    x: 50,
    y: footerY - 20,
    size: 10,
    font: regularFont,
    color: darkGray,
  });

  page.drawText("For support, contact: support@netppay.com", {
    x: 50,
    y: footerY - 35,
    size: 9,
    font: regularFont,
    color: lightGray,
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

