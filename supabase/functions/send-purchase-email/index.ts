import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { generateReceiptPDF, type ReceiptData } from "../_shared/pdf-receipt.ts";
import { NETPAY_SITE_URL } from "../_shared/site-url.ts";
import {
  getResendFromAddress,
  ResendApiError,
  sendResendEmail,
} from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PurchaseType = "electricity" | "education" | "airtime";

type ElectricityEmailPayload = {
  type: "electricity";
  email: string;
  fullName?: string;
  provider: string;
  token: string;
  amount?: number;
  units?: number;
  meterNumber: string;
  meterType?: string;
  customerName?: string;
  customerAddress?: string;
  customerId?: string;
  reference?: string;
  purchasedAt?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  chargeFee?: number;
  purchaseAmount?: number;
};

type EducationEmailPayload = {
  type: "education";
  email: string;
  fullName?: string;
  examType: string;
  pin: string;
  serial?: string;
  pins?: Array<{ Pin: string; Serial?: string }>;
  instructions?: string;
  amount?: number;
  reference?: string;
  phoneNumber?: string;
  purchasedAt?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  chargeFee?: number;
  purchaseAmount?: number;
};

type AirtimeEmailPayload = {
  type: "airtime";
  email: string;
  fullName?: string;
  network: string;
  phoneNumber: string;
  amount: number;
  reference?: string;
  purchasedAt?: string;
  balanceBefore?: number;
  balanceAfter?: number;
};

type PurchaseEmailPayload = ElectricityEmailPayload | EducationEmailPayload | AirtimeEmailPayload;

const normalizeString = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const formatCurrency = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `₦${value.toFixed(2)}`;
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatTimestamp = (value?: string) => {
  if (!value) return "";
  try {
    const date = new Date(value);
    return date.toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
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

const displayElectricityProvider = (provider: string) => {
  const key = provider.trim().toUpperCase().replace(/\s+/g, "");
  return ELECTRICITY_PROVIDER_LABELS[key] || provider.trim().toUpperCase();
};

const formatElectricityToken = (token: string) => {
  const trimmed = token.trim();
  if (!trimmed || trimmed.toLowerCase() === "processing...") return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return trimmed;
  return (digits.match(/.{1,4}/g) || [trimmed]).join(" - ");
};

const formatReceiptTimestamp = (value?: string) => {
  if (!value) return "";
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
    return formatTimestamp(value);
  }
};

const titleCaseWord = (value: string) => {
  const text = value.trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const buildElectricityEmail = (payload: ElectricityEmailPayload) => {
  const {
    provider,
    token,
    amount,
    units,
    meterNumber,
    meterType,
    customerName,
    customerAddress,
    customerId,
    reference,
    purchasedAt,
  } = payload;

  const friendlyAmount = formatCurrency(amount);
  const friendlyUnits = typeof units === "number" && !Number.isNaN(units) ? `${units.toFixed(2)} kWh` : "";
  const timestamp = formatReceiptTimestamp(purchasedAt);
  const providerLabel = displayElectricityProvider(provider);
  const formattedToken = formatElectricityToken(token);
  const meterTypeLabel = meterType ? titleCaseWord(meterType) : "";
  const addressHtml = customerAddress
    ? escapeHtml(customerAddress).replace(/\r?\n/g, "<br>")
    : "";

  const subject = "Electricity Token Purchase Successful";

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding: 14px 4px; border-bottom: 1px solid #F3E7DC;">
        <div style="font-size: 11px; letter-spacing: 0.14em; color: #FF7A00; font-weight: 700;">${escapeHtml(label)}</div>
        <div style="margin-top: 4px; font-size: 15px; line-height: 1.4; color: #1B2430; font-weight: 700;">${value}</div>
      </td>
    </tr>
  `;

  const rows = [
    customerName ? detailRow("CUSTOMER NAME", escapeHtml(customerName)) : "",
    customerId ? detailRow("CUSTOMER ID", escapeHtml(customerId)) : "",
    detailRow("PROVIDER", escapeHtml(providerLabel)),
    detailRow("METER NUMBER", escapeHtml(meterNumber)),
    meterTypeLabel ? detailRow("METER TYPE", escapeHtml(meterTypeLabel)) : "",
    friendlyAmount ? detailRow("AMOUNT PAID", escapeHtml(friendlyAmount)) : "",
    friendlyUnits ? detailRow("UNITS", escapeHtml(friendlyUnits)) : "",
    timestamp ? detailRow("PURCHASED", escapeHtml(timestamp)) : "",
    reference ? detailRow("REFERENCE", escapeHtml(reference)) : "",
    addressHtml ? detailRow("CUSTOMER ADDRESS", addressHtml) : "",
  ].join("");

  const logoUrl = Deno.env.get("NETPAY_LOGO_URL")
    || (NETPAY_SITE_URL.replace(/\/$/, "") === "https://netppay.com"
      ? "https://www.netppay.com/logo.png"
      : `${NETPAY_SITE_URL.replace(/\/$/, "")}/logo.png`);

  const tokenBlock = token.toLowerCase() === "processing..."
    ? `<p style="margin: 0; font-size: 20px; font-weight: 700; color: #1B2430;">Processing...</p>
       <p style="margin: 8px 0 0; font-size: 13px; color: #6B7280;">Your token will be available shortly. We will send an update once it is ready.</p>`
    : `<p style="margin: 0; font-size: 22px; line-height: 1.35; font-weight: 800; color: #1B2430; letter-spacing: 0.04em;">${escapeHtml(formattedToken)}</p>
       <p style="margin: 10px 0 0; font-size: 13px; color: #6B7280;">Enter this token on your meter to load your electricity.</p>`;

  const html = `
    <div style="margin: 0; padding: 24px 12px; background-color: #FFF7F0; font-family: 'Segoe UI', Arial, sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 28px; overflow: hidden; border: 1px solid #FFE0C2;">
        <tr>
          <td style="background: #FF7A00; padding: 28px 28px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background: #ffffff; border-radius: 16px; padding: 8px 12px;">
                  <img src="${logoUrl}" width="148" alt="NetPay" style="display: block; border: 0; width: 148px; max-width: 148px; height: auto;">
                </td>
                <td style="padding-left: 14px; vertical-align: middle;">
                  <div style="font-size: 11px; letter-spacing: 0.16em; color: rgba(255,255,255,0.92); font-weight: 700;">BILL PAYMENTS MADE EASY</div>
                </td>
              </tr>
            </table>
            <h1 style="margin: 28px 0 0; font-size: 32px; line-height: 1.15; color: #ffffff; font-weight: 800;">Electricity Token<br>Purchase Successful</h1>
            <p style="margin: 14px 0 0; max-width: 360px; font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.92);">Your electricity token has been successfully generated and your payment was completed.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 22px 22px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #FFF6EE; border-radius: 18px;">
              <tr>
                <td style="padding: 18px 18px 16px;">
                  <div style="font-size: 12px; letter-spacing: 0.16em; color: #FF7A00; font-weight: 800;">ELECTRICITY TOKEN</div>
                  <div style="margin-top: 8px;">${tokenBlock}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 22px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 22px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #FAFAFA; border-radius: 18px;">
              <tr>
                <td style="padding: 18px;">
                  <div style="font-size: 14px; font-weight: 800; color: #1B2430;">NetPay</div>
                  <div style="margin-top: 8px; font-size: 13px; line-height: 1.5; color: #6B7280;">
                    <a href="mailto:support@netppay.com" style="color: #6B7280; text-decoration: none;">support@netppay.com</a><br>
                    <a href="https://netppay.com" style="color: #6B7280; text-decoration: none;">www.netppay.com</a><br>
                    Your receipt is attached as a PDF.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const text = `
Electricity Token Purchase Successful

Your electricity token has been successfully generated and your payment was completed.

Token: ${formattedToken}
${customerName ? `Customer Name: ${customerName}\n` : ""}${customerId ? `Customer ID: ${customerId}\n` : ""}Provider: ${providerLabel}
Meter Number: ${meterNumber}
${meterTypeLabel ? `Meter Type: ${meterTypeLabel}\n` : ""}${friendlyAmount ? `Amount Paid: ${friendlyAmount}\n` : ""}${friendlyUnits ? `Units: ${friendlyUnits}\n` : ""}${timestamp ? `Purchased: ${timestamp}\n` : ""}${reference ? `Reference: ${reference}\n` : ""}${customerAddress ? `Customer Address: ${customerAddress}\n` : ""}
Enter this token on your meter to load your electricity.
Your receipt is attached as a PDF.

NetPay
support@netppay.com
https://netppay.com
  `.trim();

  return { subject, html, text };
};

const buildEducationEmail = (payload: EducationEmailPayload) => {
  const {
    fullName,
    examType,
    pin,
    serial,
    pins,
    instructions,
    amount,
    reference,
    phoneNumber,
    purchasedAt,
  } = payload;

  const pinEntries = (Array.isArray(pins) && pins.length > 0
    ? pins
    : pin
      ? [{ Pin: pin, Serial: serial }]
      : []
  ).filter((entry) => entry.Pin?.trim());

  const friendlyAmount = formatCurrency(amount);
  const timestamp = formatTimestamp(purchasedAt);
  const subject = `${examType.toUpperCase()} PIN Details`;

  const pinBlocksHtml = pinEntries.map((entry, index) => {
    const label = pinEntries.length > 1 ? `PIN ${index + 1}` : "PIN";
    return `
          <div style="border-radius: 16px; background: linear-gradient(135deg, #ff9f3f, #ff7f00); padding: 22px; margin-bottom: ${entry.Serial ? "16px" : "24px"}; box-shadow: 0 18px 38px rgba(255,127,0,0.28);">
            <p style="margin: 0 0 10px; font-size: 13px; color: rgba(255,255,255,0.92); letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;">${label}</p>
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: 0.28em;">${escapeHtml(entry.Pin)}</p>
          </div>
          ${entry.Serial ? `
            <div style="border-radius: 16px; background: rgba(255,255,255,0.78); padding: 20px; margin-bottom: 24px; border: 1px solid rgba(255,127,0,0.18); box-shadow: inset 0 0 0 1px rgba(255,127,0,0.08);">
              <p style="margin: 0 0 10px; font-size: 13px; color: rgba(255,127,0,0.75); letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600;">${pinEntries.length > 1 ? `Serial ${index + 1}` : "Serial Number"}</p>
              <p style="margin: 0; font-size: 22px; font-weight: 600; color: #7c2d12; letter-spacing: 0.18em;">${escapeHtml(entry.Serial)}</p>
            </div>
          ` : ""}
    `;
  }).join("");

  const pinLinesText = pinEntries.map((entry, index) => {
    const lines = [`${pinEntries.length > 1 ? `PIN ${index + 1}` : "PIN"}: ${entry.Pin}`];
    if (entry.Serial) {
      lines.push(`${pinEntries.length > 1 ? `Serial ${index + 1}` : "Serial"}: ${entry.Serial}`);
    }
    return lines.join("\n");
  }).join("\n");

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; background-color: #fff3e5; padding: 32px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 22px; padding: 0; box-shadow: 0 24px 65px rgba(255,127,0,0.28); border: 1px solid rgba(255,127,0,0.16); overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff7f00, #ffa24a); padding: 30px 32px;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.4em; text-transform: uppercase; color: rgba(255,255,255,0.65); font-weight: 600;">NetPay Education</p>
          <h1 style="margin: 12px 0 0; font-size: 24px; color: #ffffff;">${escapeHtml(examType.toUpperCase())} PIN Ready</h1>
          <p style="margin: 10px 0 0; color: rgba(255,255,255,0.85);">Hi${fullName ? ` ${escapeHtml(fullName)}` : ""}, here are your access credentials.</p>
        </div>

        <div style="padding: 32px;">
          ${pinBlocksHtml}

          <div style="background: rgba(255,255,255,0.78); border-radius: 16px; padding: 20px 22px; margin-bottom: 24px; border: 1px solid rgba(255,127,0,0.18);">
            <p style="margin: 0 0 12px; font-size: 13px; color: rgba(90,60,24,0.75); text-transform: uppercase; letter-spacing: 0.16em; font-weight: 600;">Purchase Summary</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tbody>
                <tr>
                  <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Exam</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(examType)}</td>
                </tr>
                ${friendlyAmount ? `
                  <tr>
                    <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Amount</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${friendlyAmount}</td>
                  </tr>
                ` : ""}
                ${phoneNumber ? `
                  <tr>
                    <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Phone Number</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(phoneNumber)}</td>
                  </tr>
                ` : ""}
                ${reference ? `
                  <tr>
                    <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Reference</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(reference)}</td>
                  </tr>
                ` : ""}
                ${timestamp ? `
                  <tr>
                    <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Purchased</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(timestamp)}</td>
                  </tr>
                ` : ""}
              </tbody>
            </table>
          </div>

          ${instructions ? `
            <div style="border-radius: 16px; background: rgba(255,127,0,0.08); padding: 18px 20px; margin-bottom: 26px; border: 1px dashed rgba(255,127,0,0.38);">
              <p style="margin: 0 0 8px; font-size: 13px; color: rgba(194,94,18,0.9); font-weight: 600;">Instructions</p>
              <p style="margin: 0; font-size: 13px; color: rgba(118,57,11,0.95); white-space: pre-line;">${escapeHtml(instructions)}</p>
            </div>
          ` : ""}

          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,127,0,0.12); border-radius: 16px; padding: 16px;">
            <p style="margin: 0; font-size: 13px; color: rgba(50,30,8,0.85);">Need help? Reply to this email or contact NetPay support.</p>
            <div style="width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #ffb347, #ff7f00); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">NP</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const text = `
${examType.toUpperCase()} PIN Details

${pinLinesText}
${friendlyAmount ? `Amount: ${friendlyAmount}\n` : ""}${phoneNumber ? `Phone Number: ${phoneNumber}\n` : ""}${reference ? `Reference: ${reference}\n` : ""}${timestamp ? `Purchased: ${timestamp}\n` : ""}${instructions ? `Instructions: ${instructions}\n` : ""}

Thank you for using NetPay.
  `.trim();

  return { subject, html, text };
};

const buildAirtimeEmail = (payload: AirtimeEmailPayload) => {
  const {
    fullName,
    network,
    phoneNumber,
    amount,
    reference,
    purchasedAt,
  } = payload;

  const friendlyAmount = formatCurrency(amount);
  const timestamp = formatTimestamp(purchasedAt);
  const subject = `Airtime Purchase - ${network}`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; background-color: #fff3e5; padding: 32px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 22px; padding: 0; box-shadow: 0 24px 65px rgba(255,127,0,0.28); border: 1px solid rgba(255,127,0,0.16); overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff7f00, #ffa24a); padding: 30px 32px;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.4em; text-transform: uppercase; color: rgba(255,255,255,0.65); font-weight: 600;">NetPay Airtime</p>
          <h1 style="margin: 12px 0 0; font-size: 24px; color: #ffffff;">Airtime Purchase Successful</h1>
          <p style="margin: 10px 0 0; color: rgba(255,255,255,0.85);">Hi${fullName ? ` ${escapeHtml(fullName)}` : ""}, your airtime purchase was successful.</p>
        </div>

        <div style="padding: 32px;">
          <div style="border-radius: 16px; background: linear-gradient(135deg, #ff9f3f, #ff7f00); padding: 22px; margin-bottom: 24px; box-shadow: 0 18px 38px rgba(255,127,0,0.28);">
            <p style="margin: 0 0 10px; font-size: 13px; color: rgba(255,255,255,0.92); letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;">Amount</p>
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff;">${friendlyAmount}</p>
          </div>

          <div style="background: rgba(255,255,255,0.78); border-radius: 16px; padding: 20px 22px; margin-bottom: 24px; border: 1px solid rgba(255,127,0,0.18);">
            <p style="margin: 0 0 12px; font-size: 13px; color: rgba(90,60,24,0.75); text-transform: uppercase; letter-spacing: 0.16em; font-weight: 600;">Purchase Details</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tbody>
                <tr>
                  <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Network</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(network)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Phone Number</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(phoneNumber)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Amount</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${friendlyAmount}</td>
                </tr>
                ${reference ? `
                  <tr>
                    <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Reference</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(reference)}</td>
                  </tr>
                ` : ""}
                ${timestamp ? `
                  <tr>
                    <td style="padding: 6px 0; color: rgba(90,60,24,0.75);">Purchased</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #3b2f1d;">${escapeHtml(timestamp)}</td>
                  </tr>
                ` : ""}
              </tbody>
            </table>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,127,0,0.12); border-radius: 16px; padding: 16px;">
            <p style="margin: 0; font-size: 13px; color: rgba(50,30,8,0.85);">Need help? Reply to this email or contact NetPay support.</p>
            <div style="width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #ffb347, #ff7f00); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">NP</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const text = `
Airtime Purchase Details

Network: ${network}
Phone Number: ${phoneNumber}
Amount: ${friendlyAmount}
${reference ? `Reference: ${reference}\n` : ""}${timestamp ? `Purchased: ${timestamp}\n` : ""}

Thank you for using NetPay.
  `.trim();

  return { subject, html, text };
};

const buildEmailContent = (payload: PurchaseEmailPayload) => {
  if (payload.type === "electricity") {
    if (!payload.provider || !payload.meterNumber) {
      throw new Error("provider and meterNumber are required for electricity notifications");
    }
    // Token can be null/empty when transaction is processing - use placeholder
    if (!payload.token || payload.token.trim() === '') {
      payload.token = 'Processing...'; // Placeholder for processing transactions
    }
    return buildElectricityEmail(payload);
  }

  if (payload.type === "education") {
    if (!payload.examType) {
      throw new Error("examType is required for education notifications");
    }
    const hasPin = Boolean(payload.pin) ||
      (Array.isArray(payload.pins) && payload.pins.some((entry) => entry.Pin?.trim()));
    if (!hasPin) {
      throw new Error("pin is required for education notifications");
    }
    return buildEducationEmail(payload);
  }

  if (payload.type === "airtime") {
    if (!payload.network || !payload.phoneNumber) {
      throw new Error("network and phoneNumber are required for airtime notifications");
    }
    return buildAirtimeEmail(payload);
  }

  throw new Error("Unsupported notification type");
};

const parseRequest = async (req: Request): Promise<PurchaseEmailPayload> => {
  const body = await req.json();

  const type = normalizeString(body?.type) as PurchaseType;
  if (!type || (type !== "electricity" && type !== "education" && type !== "airtime")) {
    throw new Error("type must be either 'electricity', 'education', or 'airtime'");
  }

  const email = normalizeString(body?.email);
  if (!email) {
    throw new Error("email is required");
  }

  if (type === "electricity") {
    return {
      type,
      email,
      fullName: normalizeString(body?.fullName ?? body?.name),
      provider: normalizeString(body?.provider),
      token: normalizeString(body?.token),
      amount: typeof body?.amount === "number" ? body.amount : Number(body?.amount),
      units: typeof body?.units === "number" ? body.units : Number(body?.units),
      meterNumber: normalizeString(body?.meterNumber),
      meterType: normalizeString(body?.meterType),
      customerName: normalizeString(body?.customerName),
      customerAddress: normalizeString(body?.customerAddress ?? body?.customer_address),
      customerId: normalizeString(body?.customerId ?? body?.customer_id ?? body?.account_number),
      reference: normalizeString(body?.reference),
      purchasedAt: normalizeString(body?.purchasedAt),
      balanceBefore: typeof body?.balanceBefore === "number" ? body.balanceBefore : Number(body?.balanceBefore),
      balanceAfter: typeof body?.balanceAfter === "number" ? body.balanceAfter : Number(body?.balanceAfter),
      chargeFee: typeof body?.chargeFee === "number" ? body.chargeFee : Number(body?.chargeFee),
      purchaseAmount: typeof body?.purchaseAmount === "number" ? body.purchaseAmount : Number(body?.purchaseAmount),
    };
  }

  if (type === "education") {
    const rawPins = Array.isArray(body?.pins) ? body.pins : [];
    const pins = rawPins
      .map((entry: { Pin?: string; pin?: string; Serial?: string; serial?: string }) => ({
        Pin: normalizeString(entry?.Pin ?? entry?.pin),
        Serial: normalizeString(entry?.Serial ?? entry?.serial),
      }))
      .filter((entry: { Pin: string }) => entry.Pin);

    return {
      type,
      email,
      fullName: normalizeString(body?.fullName ?? body?.name),
      examType: normalizeString(body?.examType),
      pin: normalizeString(body?.pin) || pins[0]?.Pin || "",
      serial: normalizeString(body?.serial) || pins[0]?.Serial,
      pins: pins.length > 0 ? pins : undefined,
      instructions: normalizeString(body?.instructions),
      amount: typeof body?.amount === "number" ? body.amount : Number(body?.amount),
      reference: normalizeString(body?.reference),
      phoneNumber: normalizeString(body?.phoneNumber),
      purchasedAt: normalizeString(body?.purchasedAt),
      balanceBefore: typeof body?.balanceBefore === "number" ? body.balanceBefore : Number(body?.balanceBefore),
      balanceAfter: typeof body?.balanceAfter === "number" ? body.balanceAfter : Number(body?.balanceAfter),
      chargeFee: typeof body?.chargeFee === "number" ? body.chargeFee : Number(body?.chargeFee),
      purchaseAmount: typeof body?.purchaseAmount === "number" ? body.purchaseAmount : Number(body?.purchaseAmount),
    };
  }

  // Airtime
  return {
    type,
    email,
    fullName: normalizeString(body?.fullName ?? body?.name),
    network: normalizeString(body?.network),
    phoneNumber: normalizeString(body?.phoneNumber),
    amount: typeof body?.amount === "number" ? body.amount : Number(body?.amount),
    reference: normalizeString(body?.reference),
    purchasedAt: normalizeString(body?.purchasedAt),
    balanceBefore: typeof body?.balanceBefore === "number" ? body.balanceBefore : Number(body?.balanceBefore),
    balanceAfter: typeof body?.balanceAfter === "number" ? body.balanceAfter : Number(body?.balanceAfter),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const FROM_ADDRESS = getResendFromAddress();

    const payload = await parseRequest(req);
    const { subject, html, text } = buildEmailContent(payload);

    // Generate PDF receipt
    let pdfAttachment: { filename: string; content: string } | null = null;
    try {
      const receiptData: ReceiptData = payload.type === "electricity" ? {
        type: "electricity",
        userEmail: payload.email,
        userName: payload.fullName,
        amount: payload.amount || 0,
        reference: payload.reference || "",
        purchasedAt: payload.purchasedAt || new Date().toISOString(),
        balanceBefore: payload.balanceBefore || 0,
        balanceAfter: payload.balanceAfter || 0,
        provider: payload.provider,
        meterNumber: payload.meterNumber,
        meterType: payload.meterType,
        customerName: payload.customerName,
        customerAddress: payload.customerAddress,
        customerId: payload.customerId,
        token: payload.token,
        units: payload.units,
        chargeFee: payload.chargeFee,
        purchaseAmount: payload.purchaseAmount,
      } : payload.type === "education" ? {
        type: "education",
        userEmail: payload.email,
        userName: payload.fullName,
        amount: payload.amount || 0,
        reference: payload.reference || "",
        purchasedAt: payload.purchasedAt || new Date().toISOString(),
        balanceBefore: payload.balanceBefore || 0,
        balanceAfter: payload.balanceAfter || 0,
        examType: payload.examType,
        pin: payload.pin,
        serial: payload.serial,
        pins: payload.pins,
        phoneNumber: payload.phoneNumber,
        chargeFee: payload.chargeFee,
        purchaseAmount: payload.purchaseAmount,
      } : {
        type: "airtime",
        userEmail: payload.email,
        userName: payload.fullName,
        amount: payload.amount,
        reference: payload.reference || "",
        purchasedAt: payload.purchasedAt || new Date().toISOString(),
        balanceBefore: payload.balanceBefore || 0,
        balanceAfter: payload.balanceAfter || 0,
        network: payload.network,
        phoneNumber: payload.phoneNumber,
      };

      const pdfBytes = await generateReceiptPDF(receiptData);
      const fileName = payload.type === "electricity"
        ? `NetPay-Electricity-Receipt-${payload.reference || Date.now()}.pdf`
        : `NetPay-${payload.type}-${payload.reference || Date.now()}.pdf`;
      pdfAttachment = {
        filename: fileName,
        content: encodeBase64(pdfBytes),
      };
    } catch (pdfError) {
      console.error("Error generating PDF receipt:", pdfError);
      // Continue without PDF attachment if generation fails
    }

    const resendJson = await sendResendEmail({
      from: FROM_ADDRESS,
      to: [payload.email],
      subject,
      html,
      text,
      tags: [{ name: "notification_type", value: payload.type }],
      attachments: pdfAttachment
        ? [{
          filename: pdfAttachment.filename,
          content: pdfAttachment.content,
          content_type: "application/pdf",
        }]
        : undefined,
    });

    return new Response(
      JSON.stringify({ success: true, data: resendJson }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-purchase-email error:", error);
    if (error instanceof ResendApiError) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email", details: error.details }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});


