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
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

export async function generateReceiptPDF(data: ReceiptData): Promise<Uint8Array> {
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

    // PIN (highlighted)
    page.drawRectangle({
      x: 50,
      y: yPosition - 30,
      width: width - 100,
      height: 40,
      color: rgb(1, 0.9, 0.8),
      borderColor: orange,
      borderWidth: 2,
    });

    page.drawText("PIN:", {
      x: 60,
      y: yPosition - 10,
      size: 10,
      font: boldFont,
      color: darkGray,
    });

    page.drawText(data.pin, {
      x: 60,
      y: yPosition - 25,
      size: 16,
      font: boldFont,
      color: orange,
    });

    yPosition -= 50;

    if (data.serial) {
      page.drawRectangle({
        x: 50,
        y: yPosition - 30,
        width: width - 100,
        height: 40,
        color: rgb(1, 0.9, 0.8),
        borderColor: orange,
        borderWidth: 2,
      });

      page.drawText("SERIAL NUMBER:", {
        x: 60,
        y: yPosition - 10,
        size: 10,
        font: boldFont,
        color: darkGray,
      });

      page.drawText(data.serial, {
        x: 60,
        y: yPosition - 25,
        size: 14,
        font: boldFont,
        color: orange,
      });

      yPosition -= 50;
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

  page.drawText("For support, contact: support@netpayy.ng", {
    x: 50,
    y: footerY - 35,
    size: 9,
    font: regularFont,
    color: lightGray,
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

