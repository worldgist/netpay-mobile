import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EMAIL_INLINE_IMAGES } from "../_shared/email-images.ts";
import { buildPlainReceiptPdf } from "../_shared/plain-pdf.ts";
import { NETPAY_SITE_URL } from "../_shared/site-url.ts";
import {
  getResendFromAddress,
  ResendApiError,
  type ResendAttachment,
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
  const logoUrl = Deno.env.get("NETPAY_LOGO_URL")
    || (NETPAY_SITE_URL.replace(/\/$/, "") === "https://netppay.com"
      ? "https://www.netppay.com/logo.png"
      : `${NETPAY_SITE_URL.replace(/\/$/, "")}/logo.png`);
  const processing = token.toLowerCase() === "processing...";
  const tokenHtml = processing
    ? `<div style="font-size: 16px; line-height: 1.3; font-weight: 800; color: #1A2B4A; text-align: center;">Processing...</div>
       <div style="margin-top: 8px; font-size: 12px; color: #667085; text-align: center;">Your token will be available shortly. We will send an update once it is ready.</div>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
         <tr>
           <td nowrap align="center" style="font-size: 16px; line-height: 22px; font-weight: 800; color: #1A2B4A; letter-spacing: 0; white-space: nowrap;">${escapeHtml(formattedToken)}</td>
         </tr>
       </table>
       <div style="margin-top: 8px; font-size: 12px; color: #667085; text-align: center;">Enter this token on your meter to load your electricity.</div>
       <div style="margin-top: 4px; font-size: 12px; color: #667085; text-align: center;">Your PDF receipt is attached to this email.</div>`;

  const iconCell = (symbol: string) => `
    <td width="36" valign="top" style="width: 36px;">
      <div style="width: 32px; height: 32px; background: #FFF3E8; border-radius: 16px; text-align: center; line-height: 32px; color: #FF7F00; font-size: 15px;">${symbol}</div>
    </td>`;

  const detailCell = (symbol: string, label: string, value: string) => `
    <td width="50%" valign="top" style="width: 50%; padding: 8px 8px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          ${iconCell(symbol)}
          <td valign="top" style="padding-left: 8px;">
            <div style="font-size: 10px; letter-spacing: 0.12em; color: #FF7F00; font-weight: 700;">${escapeHtml(label)}</div>
            <div style="margin-top: 3px; font-size: 13px; line-height: 1.35; color: #1A2B4A; font-weight: 700;">${value}</div>
          </td>
        </tr>
      </table>
    </td>`;

  const detailPairs: Array<[string, string, string, string, string, string]> = [
    ["&#128100;", "CUSTOMER NAME", customerName ? escapeHtml(customerName) : "—", "&#127968;", "CUSTOMER ADDRESS", addressHtml || "—"],
    ["&#9889;", "PROVIDER", escapeHtml(providerLabel), "&#128246;", "METER NUMBER", escapeHtml(meterNumber)],
    ["&#9201;", "METER TYPE", meterTypeLabel ? escapeHtml(meterTypeLabel) : "—", "&#128181;", "AMOUNT PAID", friendlyAmount ? escapeHtml(friendlyAmount) : "—"],
    ["&#128197;", "PURCHASED", timestamp ? escapeHtml(timestamp) : "—", "&#128196;", "REFERENCE", reference ? escapeHtml(reference) : "—"],
  ];
  if (customerId || friendlyUnits) {
    detailPairs.push([
      "&#128273;",
      "CUSTOMER ID",
      customerId ? escapeHtml(customerId) : "—",
      "&#9889;",
      "UNITS",
      friendlyUnits ? escapeHtml(friendlyUnits) : "—",
    ]);
  }
  const detailRows = detailPairs.map(([leftSymbol, leftLabel, leftValue, rightSymbol, rightLabel, rightValue]) => `
    <tr>
      ${detailCell(leftSymbol, leftLabel, leftValue)}
      ${detailCell(rightSymbol, rightLabel, rightValue)}
    </tr>`).join("");

  const serviceIcon = (symbol: string, label: string) => `
    <td align="center" style="padding: 0 8px;">
      <div style="width: 42px; height: 42px; background: #FFF3E8; border-radius: 21px; text-align: center; line-height: 42px; font-size: 18px;">${symbol}</div>
      <div style="margin-top: 6px; font-size: 11px; color: #667085;">${label}</div>
    </td>`;

  const html = `
    <div style="margin: 0; padding: 24px 12px; background-color: #F4F6F8; font-family: 'Segoe UI', Arial, sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #E8EDF2; border-radius: 16px;">
        <tr>
          <td style="padding: 22px 24px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td valign="middle">
                  <img src="${logoUrl}" width="132" alt="NetPay" style="display: block; border: 0; width: 132px; max-width: 132px; height: auto;">
                </td>
                <td valign="middle" align="right" style="font-size: 11px; letter-spacing: 0.14em; color: #98A2B3; font-weight: 700;">
                  BILL PAYMENTS<br>MADE EASY
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 20px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#FF7F00" style="background: #FF7F00; border-radius: 18px;">
              <tr>
                <td style="padding: 22px 18px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td width="72" valign="middle" style="width: 72px;">
                        <div style="width: 58px; height: 58px; background: #ffffff; border-radius: 29px; text-align: center; line-height: 58px; font-size: 28px;">&#128161;</div>
                      </td>
                      <td valign="middle" style="padding-left: 8px;">
                        <div style="font-size: 26px; line-height: 1.15; color: #ffffff; font-weight: 800;">Electricity Token<br>Purchase Successful</div>
                        <div style="margin-top: 8px; font-size: 14px; line-height: 1.45; color: #FFF6EE;">Your electricity token has been successfully generated and your payment was completed.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 20px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #FFF8F3; border: 1px solid #F3E4D6; border-radius: 16px;">
              <tr>
                <td style="padding: 18px 18px 16px;">
                  <div style="font-size: 11px; letter-spacing: 0.16em; color: #FF7F00; font-weight: 800;">ELECTRICITY TOKEN</div>
                  <div style="margin-top: 10px;">${tokenHtml}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 20px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #EEF2F6; border-radius: 16px;">
              <tr>
                <td style="padding: 16px 10px 6px;">
                  <div style="padding: 0 8px 8px; font-size: 12px; letter-spacing: 0.14em; color: #FF7F00; font-weight: 800;">TRANSACTION DETAILS</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    ${detailRows}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 20px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#F8FAFC" style="background: #F8FAFC; border-radius: 16px;">
              <tr>
                <td valign="top" style="padding: 18px; width: 52%;">
                  <div style="font-size: 16px; font-weight: 800; color: #1A2B4A;">NETPAY</div>
                  <div style="margin-top: 2px; font-size: 12px; color: #667085;">Bill Payments Made Easy</div>
                  <div style="margin-top: 12px; font-size: 13px; line-height: 1.5; color: #667085;">Thank you for using NetPay. We are committed to making your bill payments simple, fast and secure.</div>
                  <div style="margin-top: 14px; font-size: 13px; line-height: 1.7; color: #344054;">
                    <a href="mailto:support@netppay.com" style="color: #344054; text-decoration: none;">support@netppay.com</a><br>
                    <a href="https://www.netppay.com" style="color: #344054; text-decoration: none;">www.netppay.com</a><br>
                    +234 706 739 8399
                  </div>
                </td>
                <td valign="top" style="padding: 18px 12px 18px 0;">
                  <div style="font-size: 12px; letter-spacing: 0.12em; color: #FF7F00; font-weight: 800;">OUR SERVICES</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
                    <tr>
                      ${serviceIcon("&#9889;", "Electricity")}
                      ${serviceIcon("&#128241;", "Airtime")}
                      ${serviceIcon("&#128246;", "Data")}
                      ${serviceIcon("&#128250;", "Cable TV")}
                    </tr>
                  </table>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 14px;">
                    <tr>
                      <td style="padding-right: 8px;">
                        <a href="https://apps.apple.com/search?term=NetPay" style="text-decoration: none;">
                          <img src="cid:app-store-badge" width="120" height="36" alt="Download on the App Store" style="display: block; border: 0; width: 120px; height: 36px;">
                        </a>
                      </td>
                      <td>
                        <a href="https://play.google.com/store/search?q=NetPay&amp;c=apps" style="text-decoration: none;">
                          <img src="cid:google-play-badge" width="120" height="36" alt="Get it on Google Play" style="display: block; border: 0; width: 120px; height: 36px;">
                        </a>
                      </td>
                    </tr>
                  </table>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
                    <tr>
                      <td valign="middle" style="font-size: 12px; color: #667085; padding-right: 8px;">Connect with us</td>
                      <td style="padding-right: 8px;">
                        <a href="https://facebook.com/netpay" style="text-decoration: none;">
                          <img src="cid:social-facebook" width="32" height="32" alt="Facebook" style="display: block; border: 0; width: 32px; height: 32px;">
                        </a>
                      </td>
                      <td style="padding-right: 8px;">
                        <a href="https://twitter.com/netpay" style="text-decoration: none;">
                          <img src="cid:social-x" width="32" height="32" alt="X" style="display: block; border: 0; width: 32px; height: 32px;">
                        </a>
                      </td>
                      <td>
                        <a href="https://instagram.com/netpay" style="text-decoration: none;">
                          <img src="cid:social-instagram" width="32" height="32" alt="Instagram" style="display: block; border: 0; width: 32px; height: 32px;">
                        </a>
                      </td>
                    </tr>
                  </table>
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
${customerName ? `Customer Name: ${customerName}\n` : ""}${customerAddress ? `Customer Address: ${customerAddress}\n` : ""}${customerId ? `Customer ID: ${customerId}\n` : ""}Provider: ${providerLabel}
Meter Number: ${meterNumber}
${meterTypeLabel ? `Meter Type: ${meterTypeLabel}\n` : ""}${friendlyAmount ? `Amount Paid: ${friendlyAmount}\n` : ""}${friendlyUnits ? `Units: ${friendlyUnits}\n` : ""}${timestamp ? `Purchased: ${timestamp}\n` : ""}${reference ? `Reference: ${reference}\n` : ""}
Enter this token on your meter to load your electricity.
Your PDF receipt is attached to this email.

NetPay
support@netppay.com
https://www.netppay.com
+234 706 739 8399
  `.trim();

  const attachments: ResendAttachment[] = EMAIL_INLINE_IMAGES.map((image) => ({
    filename: image.filename,
    content: image.content,
    content_type: "image/png",
    content_id: image.contentId,
  }));

  return { subject, html, text, attachments };
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

type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
  attachments?: ResendAttachment[];
};

const buildEmailContent = (payload: PurchaseEmailPayload): BuiltEmail => {
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function buildPdfAttachment(payload: PurchaseEmailPayload): Promise<{
  attachment: ResendAttachment | null;
  error?: string;
}> {
  try {
    const purchasedAt = payload.purchasedAt || new Date().toISOString();
    const amount = typeof payload.amount === "number" && Number.isFinite(payload.amount) ? payload.amount : 0;
    const reference = payload.reference || "";
    const amountText = amount > 0
      ? `NGN ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";
    const purchasedText = payload.type === "electricity"
      ? formatReceiptTimestamp(purchasedAt)
      : formatTimestamp(purchasedAt);
    const rows: Array<[string, string]> = [];
    let title = "NetPay Purchase Receipt";
    let subtitle = "Your payment was completed.";
    let highlightLabel = "";
    let highlightValue = "";

    if (payload.type === "electricity") {
      title = "Electricity Token Purchase Successful";
      subtitle = "Your electricity token has been successfully generated and your payment was completed.";
      highlightLabel = "ELECTRICITY TOKEN";
      highlightValue = formatElectricityToken(payload.token);
      if (payload.customerName) rows.push(["CUSTOMER NAME", payload.customerName]);
      if (payload.customerAddress) rows.push(["CUSTOMER ADDRESS", payload.customerAddress]);
      if (payload.customerId) rows.push(["CUSTOMER ID", payload.customerId]);
      rows.push(["PROVIDER", displayElectricityProvider(payload.provider)]);
      rows.push(["METER NUMBER", payload.meterNumber]);
      if (payload.meterType) rows.push(["METER TYPE", titleCaseWord(payload.meterType)]);
      if (amountText) rows.push(["AMOUNT PAID", amountText]);
      if (typeof payload.units === "number" && Number.isFinite(payload.units)) {
        rows.push(["UNITS", `${payload.units.toFixed(2)} kWh`]);
      }
      if (purchasedText) rows.push(["PURCHASED", purchasedText]);
      if (reference) rows.push(["REFERENCE", reference]);
    } else if (payload.type === "education") {
      title = `${payload.examType.toUpperCase()} PIN Ready`;
      highlightLabel = "PIN";
      highlightValue = payload.pin;
      rows.push(["EXAM", payload.examType]);
      if (payload.serial) rows.push(["SERIAL", payload.serial]);
      if (payload.phoneNumber) rows.push(["PHONE NUMBER", payload.phoneNumber]);
      if (amountText) rows.push(["AMOUNT", amountText]);
      if (purchasedText) rows.push(["PURCHASED", purchasedText]);
      if (reference) rows.push(["REFERENCE", reference]);
    } else {
      title = "Airtime Purchase Successful";
      rows.push(["NETWORK", payload.network]);
      rows.push(["PHONE NUMBER", payload.phoneNumber]);
      if (amountText) rows.push(["AMOUNT", amountText]);
      if (purchasedText) rows.push(["PURCHASED", purchasedText]);
      if (reference) rows.push(["REFERENCE", reference]);
    }

    const bytes = buildPlainReceiptPdf({
      title,
      subtitle,
      highlightLabel,
      highlightValue,
      rows,
      footer: ["support@netppay.com", "www.netppay.com", "+234 706 739 8399"],
    });
    const safeReference = (reference || "receipt").replace(/[^\w.-]+/g, "-");
    return {
      attachment: {
        filename: `NetPay-Receipt-${safeReference}.pdf`,
        content: bytesToBase64(bytes),
        content_type: "application/pdf",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Purchase PDF receipt skipped:", message);
    return { attachment: null, error: message.slice(0, 300) };
  }
}

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
    const { subject, html, text, attachments } = buildEmailContent(payload);
    const pdfResult = await buildPdfAttachment(payload);
    const pdfAttachment = pdfResult.attachment;
    const attachmentsWithPdf = pdfAttachment
      ? [...(attachments ?? []), pdfAttachment]
      : attachments;

    let resendJson;
    try {
      resendJson = await sendResendEmail({
        from: FROM_ADDRESS,
        to: [payload.email],
        subject,
        html,
        text,
        tags: [{ name: "notification_type", value: payload.type }],
        attachments: attachmentsWithPdf,
      });
    } catch (sendError) {
      if (!pdfAttachment) throw sendError;
      console.error("Email with PDF was rejected. Sending the notification without the PDF.", sendError);
      resendJson = await sendResendEmail({
        from: FROM_ADDRESS,
        to: [payload.email],
        subject,
        html,
        text,
        tags: [{ name: "notification_type", value: payload.type }],
        attachments,
      });
    }

    return new Response(
      JSON.stringify({ success: true, pdfAttached: Boolean(pdfAttachment), data: resendJson }),
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


