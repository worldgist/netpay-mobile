import { NETPAY_SITE_URL, authRedirectUrls } from "./site-url.ts";
import { escapeHtml } from "./admin-password-reset-email.ts";

export function buildAdminCreatedAccountEmail(params: {
  fullName: string;
  email: string;
  password: string;
  phone?: string | null;
  note?: string | null;
}) {
  const { fullName, email, password, phone, note } = params;
  const greetingName = fullName.trim() || email;
  const logoUrl = Deno.env.get("NETPAY_LOGO_URL") || `${NETPAY_SITE_URL}/logo.png`;
  const signInUrl = authRedirectUrls.openApp();
  const noteBlock = note
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;color:#222222;font-size:14px;font-weight:bold;">Note from NetPay</p>
                    <p style="margin:0;color:#666666;font-size:14px;line-height:22px;">${escapeHtml(note)}</p>
                  </td>
                </tr>
              </table>`
    : "";
  const phoneLine = phone
    ? `<br>Phone: <strong style="color:#222222;">${escapeHtml(phone)}</strong>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your NetPay account is ready</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .content { padding: 28px 20px !important; }
      .password-box { font-size: 22px !important; letter-spacing: 1px !important; padding: 16px 20px !important; }
      .title { font-size: 26px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f7fb;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    A NetPay administrator created your account. Sign in with the password below and update it in the app.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <tr>
            <td class="content" style="padding:36px 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle">
                    <img src="${logoUrl}" width="150" alt="NetPay" style="display:block;border:0;max-width:150px;height:auto;">
                  </td>
                  <td align="right" valign="middle" style="color:#888888;font-size:13px;font-weight:600;letter-spacing:0.5px;">
                    WELCOME
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="content" style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <div style="width:88px;height:88px;background-color:#FFF2E8;border-radius:44px;line-height:88px;font-size:36px;text-align:center;">
                      &#128075;
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 class="title" style="margin:0 0 16px;color:#222222;font-size:30px;font-weight:bold;line-height:1.25;">
                      Your NetPay account is ready
                    </h1>
                    <p style="margin:0;color:#666666;font-size:16px;line-height:26px;text-align:center;">
                      Hello ${escapeHtml(greetingName)},<br><br>
                      A NetPay administrator created an account for
                      <strong style="color:#222222;">${escapeHtml(email)}</strong>.${phoneLine}
                      Use the password below to sign in, then change it from your profile.
                    </p>
                  </td>
                </tr>
              </table>

              ${noteBlock}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 12px;color:#888888;font-size:14px;line-height:22px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">
                      Your sign-in password
                    </p>
                    <p class="password-box" style="margin:0;padding:18px 28px;border:2px solid #FFE1CC;border-radius:14px;background-color:#FFFAF5;font-size:28px;font-weight:bold;letter-spacing:2px;color:#FF6B00;display:inline-block;font-family:'Courier New',Courier,monospace;word-break:break-all;">
                      ${escapeHtml(password)}
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="${escapeHtml(signInUrl)}" target="_blank" style="background-color:#FF6B00;color:#ffffff;padding:16px 48px;text-decoration:none;font-size:17px;font-weight:bold;border-radius:10px;display:inline-block;">
                      Open NetPay &amp; Sign In
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7F2;border:1px solid #FFE1CC;border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;color:#222222;font-size:15px;font-weight:bold;">
                      Keep your account secure
                    </p>
                    <p style="margin:0;color:#666666;font-size:14px;line-height:24px;">
                      Sign in with this password, then update it immediately. Never share your password or PIN with anyone.
                      NetPay staff will never ask for your PIN or OTP.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <p style="margin:0;color:#666666;font-size:15px;line-height:22px;">
                      Need help? Contact
                      <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#fafafa;padding:28px 40px;text-align:center;border-top:1px solid #f0f0f0;">
              <p style="margin:0 0 8px;color:#888888;font-size:14px;line-height:22px;">
                Need help?
                <a href="mailto:support@netppay.com" style="color:#FF6B00;text-decoration:none;font-weight:600;">support@netppay.com</a>
              </p>
              <p style="margin:0;color:#aaaaaa;font-size:12px;line-height:20px;">
                &copy; 2026 NetPay. All rights reserved.<br>
                <a href="${escapeHtml(NETPAY_SITE_URL)}" style="color:#aaaaaa;text-decoration:none;">${escapeHtml(NETPAY_SITE_URL)}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Your NetPay account is ready",
    "",
    `Hello ${greetingName},`,
    "",
    `A NetPay administrator created an account for ${email}.`,
    phone ? `Phone: ${phone}` : "",
    note ? `Note: ${note}` : "",
    "",
    `Your sign-in password: ${password}`,
    "",
    `Open NetPay: ${signInUrl}`,
    "",
    "Sign in, then change this password from your profile.",
    "Need help? support@netppay.com",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { html, text };
}
