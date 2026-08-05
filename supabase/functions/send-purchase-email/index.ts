import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateReceiptPDF, type ReceiptData } from "../_shared/pdf-receipt.ts";
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

const buildElectricityEmail = (payload: ElectricityEmailPayload) => {
  const {
    fullName,
    provider,
    token,
    amount,
    units,
    meterNumber,
    meterType,
    customerName,
    reference,
    purchasedAt,
  } = payload;

  const friendlyAmount = formatCurrency(amount);
  const friendlyUnits = typeof units === "number" && !Number.isNaN(units) ? `${units.toFixed(2)} kWh` : "";
  const timestamp = formatTimestamp(purchasedAt);

  const subject = `Electricity Token - ${provider}`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; background-color: #fef2e8; padding: 32px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 22px; padding: 0; box-shadow: 0 24px 65px rgba(255,127,0,0.28); border: 1px solid rgba(255,127,0,0.16); overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff7f00, #ff9f3f); padding: 30px 32px;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.42em; text-transform: uppercase; color: rgba(255,255,255,0.65); font-weight: 600;">NetPay Electricity</p>
          <h1 style="margin: 12px 0 0; font-size: 24px; color: #ffffff;">Your Electricity Token</h1>
          <p style="margin: 10px 0 0; color: rgba(255,255,255,0.85);">Thank you${fullName ? `, ${escapeHtml(fullName)}` : ""}! Here are the details of your purchase.</p>
        </div>

        <div style="padding: 32px;">
        <div style="border-radius: 16px; background: linear-gradient(135deg, #ff9f3f, #ff7f00); padding: 22px; margin-bottom: 28px; box-shadow: 0 18px 38px rgba(255,127,0,0.28);">
          <p style="margin: 0 0 10px; font-size: 13px; color: rgba(255,255,255,0.9); letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;">Token</p>
          ${token === 'Processing...' ? `
            <p style="margin: 0; font-size: 20px; font-weight: 600; color: #ffffff;">Processing...</p>
            <p style="margin: 8px 0 0; font-size: 13px; color: rgba(255,255,255,0.85);">Your token will be available shortly. We'll send you an update once it's ready.</p>
          ` : `
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: 0.28em;">${escapeHtml(token)}</p>
          `}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 28px;">
          ${customerName ? `
            <div style="background: rgba(255,255,255,0.7); padding: 18px; border-radius: 14px; border: 1px solid rgba(255,127,0,0.18);">
              <p style="margin: 0 0 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,127,0,0.7); font-weight: 600;">Customer Name</p>
              <p style="margin: 0; font-size: 16px; color: #3b2f1d; font-weight: 600;">${escapeHtml(customerName)}</p>
            </div>
          ` : ""}
          <div style="background: rgba(255,255,255,0.7); padding: 18px; border-radius: 14px; border: 1px solid rgba(255,127,0,0.18);">
            <p style="margin: 0 0 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,127,0,0.7); font-weight: 600;">Provider</p>
            <p style="margin: 0; font-size: 16px; color: #3b2f1d; font-weight: 600;">${escapeHtml(provider)}</p>
          </div>
          <div style="background: rgba(255,255,255,0.7); padding: 18px; border-radius: 14px; border: 1px solid rgba(255,127,0,0.18);">
            <p style="margin: 0 0 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,127,0,0.7); font-weight: 600;">Meter Number</p>
            <p style="margin: 0; font-size: 16px; color: #3b2f1d; font-weight: 600;">${escapeHtml(meterNumber)}</p>
          </div>
          ${meterType ? `
            <div style="background: rgba(255,255,255,0.7); padding: 18px; border-radius: 14px; border: 1px solid rgba(255,127,0,0.18);">
              <p style="margin: 0 0 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,127,0,0.7); font-weight: 600;">Meter Type</p>
              <p style="margin: 0; font-size: 16px; color: #3b2f1d; font-weight: 600;">${escapeHtml(meterType)}</p>
            </div>
          ` : ""}
          ${friendlyAmount ? `
            <div style="background: rgba(255,255,255,0.7); padding: 18px; border-radius: 14px; border: 1px solid rgba(255,127,0,0.18);">
              <p style="margin: 0 0 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,127,0,0.7); font-weight: 600;">Amount Paid</p>
              <p style="margin: 0; font-size: 16px; color: #3b2f1d; font-weight: 600;">${friendlyAmount}</p>
            </div>
          ` : ""}
          ${friendlyUnits ? `
            <div style="background: rgba(255,255,255,0.7); padding: 18px; border-radius: 14px; border: 1px solid rgba(255,127,0,0.18);">
              <p style="margin: 0 0 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(255,127,0,0.7); font-weight: 600;">Units</p>
              <p style="margin: 0; font-size: 16px; color: #3b2f1d; font-weight: 600;">${friendlyUnits}</p>
            </div>
          ` : ""}
        </div>

        ${(reference || timestamp) ? `
          <div style="border-radius: 16px; background-color: rgba(255,127,0,0.08); padding: 18px; margin-bottom: 26px; border: 1px dashed rgba(255,127,0,0.32);">
            ${reference ? `
              <p style="margin: 0 0 6px; font-size: 13px; color: rgba(61,43,13,0.85);"><strong>Reference:</strong> ${escapeHtml(reference)}</p>
            ` : ""}
            ${timestamp ? `
              <p style="margin: 0; font-size: 13px; color: rgba(61,43,13,0.85);"><strong>Purchased:</strong> ${escapeHtml(timestamp)}</p>
            ` : ""}
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
Electricity Token Details

Token: ${token}
Provider: ${provider}
${customerName ? `Customer Name: ${customerName}\n` : ""}Meter Number: ${meterNumber}
${meterType ? `Meter Type: ${meterType}\n` : ""}${friendlyAmount ? `Amount Paid: ${friendlyAmount}\n` : ""}${friendlyUnits ? `Units: ${friendlyUnits}\n` : ""}${reference ? `Reference: ${reference}\n` : ""}${timestamp ? `Purchased: ${timestamp}\n` : ""}

Thank you for using NetPay.
  `.trim();

  return { subject, html, text };
};

const buildEducationEmail = (payload: EducationEmailPayload) => {
  const {
    fullName,
    examType,
    pin,
    serial,
    instructions,
    amount,
    reference,
    phoneNumber,
    purchasedAt,
  } = payload;

  const friendlyAmount = formatCurrency(amount);
  const timestamp = formatTimestamp(purchasedAt);
  const subject = `${examType.toUpperCase()} PIN Details`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; background-color: #fff3e5; padding: 32px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 22px; padding: 0; box-shadow: 0 24px 65px rgba(255,127,0,0.28); border: 1px solid rgba(255,127,0,0.16); overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff7f00, #ffa24a); padding: 30px 32px;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.4em; text-transform: uppercase; color: rgba(255,255,255,0.65); font-weight: 600;">NetPay Education</p>
          <h1 style="margin: 12px 0 0; font-size: 24px; color: #ffffff;">${escapeHtml(examType.toUpperCase())} PIN Ready</h1>
          <p style="margin: 10px 0 0; color: rgba(255,255,255,0.85);">Hi${fullName ? ` ${escapeHtml(fullName)}` : ""}, here are your access credentials.</p>
        </div>

        <div style="padding: 32px;">
          <div style="border-radius: 16px; background: linear-gradient(135deg, #ff9f3f, #ff7f00); padding: 22px; margin-bottom: 24px; box-shadow: 0 18px 38px rgba(255,127,0,0.28);">
            <p style="margin: 0 0 10px; font-size: 13px; color: rgba(255,255,255,0.92); letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600;">PIN</p>
            <p style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: 0.28em;">${escapeHtml(pin)}</p>
          </div>

          ${serial ? `
            <div style="border-radius: 16px; background: rgba(255,255,255,0.78); padding: 20px; margin-bottom: 24px; border: 1px solid rgba(255,127,0,0.18); box-shadow: inset 0 0 0 1px rgba(255,127,0,0.08);">
              <p style="margin: 0 0 10px; font-size: 13px; color: rgba(255,127,0,0.75); letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600;">Serial Number</p>
              <p style="margin: 0; font-size: 22px; font-weight: 600; color: #7c2d12; letter-spacing: 0.18em;">${escapeHtml(serial)}</p>
            </div>
          ` : ""}

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

PIN: ${pin}
${serial ? `Serial: ${serial}\n` : ""}${friendlyAmount ? `Amount: ${friendlyAmount}\n` : ""}${phoneNumber ? `Phone Number: ${phoneNumber}\n` : ""}${reference ? `Reference: ${reference}\n` : ""}${timestamp ? `Purchased: ${timestamp}\n` : ""}${instructions ? `Instructions: ${instructions}\n` : ""}

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
    if (!payload.pin || !payload.examType) {
      throw new Error("pin and examType are required for education notifications");
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
      reference: normalizeString(body?.reference),
      purchasedAt: normalizeString(body?.purchasedAt),
      balanceBefore: typeof body?.balanceBefore === "number" ? body.balanceBefore : Number(body?.balanceBefore),
      balanceAfter: typeof body?.balanceAfter === "number" ? body.balanceAfter : Number(body?.balanceAfter),
      chargeFee: typeof body?.chargeFee === "number" ? body.chargeFee : Number(body?.chargeFee),
      purchaseAmount: typeof body?.purchaseAmount === "number" ? body.purchaseAmount : Number(body?.purchaseAmount),
    };
  }

  if (type === "education") {
    return {
      type,
      email,
      fullName: normalizeString(body?.fullName ?? body?.name),
      examType: normalizeString(body?.examType),
      pin: normalizeString(body?.pin),
      serial: normalizeString(body?.serial),
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
      // Convert Uint8Array to base64
      const pdfBase64 = btoa(String.fromCharCode.apply(null, Array.from(pdfBytes)));
      const fileName = `NetPay-${payload.type}-${payload.reference || Date.now()}.pdf`;
      pdfAttachment = {
        filename: fileName,
        content: pdfBase64,
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
        ? [{ filename: pdfAttachment.filename, content: pdfAttachment.content }]
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


