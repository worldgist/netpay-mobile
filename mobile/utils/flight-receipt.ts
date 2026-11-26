import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Share } from 'react-native';
import { formatDuration, formatFlightCurrency } from '@/utils/flight-data';

export type FlightReceiptData = {
  bookingReference: string;
  bookingDateLabel: string;
  bookingTimeLabel: string;
  fromCode: string;
  fromCity: string;
  fromName: string;
  toCode: string;
  toCity: string;
  toName: string;
  passengers: string;
  cabinClass: string;
  passengerName: string;
  email: string;
  phoneDisplay: string;
  airline?: string;
  flightNumber?: string;
  departureDateLabel?: string;
  arrivalDateLabel?: string;
  durationMinutes?: number;
  stops?: number;
  bookingClass?: string;
  baggage?: string;
  ticketPrice?: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildFlightReceiptShareMessage(data: FlightReceiptData) {
  const lines = [
    'NetPay Flight Booking Confirmed',
    `Reference: ${data.bookingReference}`,
    `Booked: ${data.bookingDateLabel} at ${data.bookingTimeLabel}`,
    `${data.fromCode} (${data.fromCity}) → ${data.toCode} (${data.toCity})`,
  ];

  if (data.airline && data.flightNumber) {
    lines.push(`${data.airline} ${data.flightNumber}`);
  }
  if (data.departureDateLabel) {
    lines.push(`Depart: ${data.departureDateLabel}`);
  }
  if (data.arrivalDateLabel) {
    lines.push(`Arrive: ${data.arrivalDateLabel}`);
  }
  if (typeof data.durationMinutes === 'number') {
    lines.push(`Duration: ${formatDuration(data.durationMinutes)}`);
  }
  if (typeof data.ticketPrice === 'number') {
    lines.push(`Fare: ${formatFlightCurrency(data.ticketPrice)}`);
  }

  lines.push(`Passenger: ${data.passengerName}`);
  lines.push(`Class: ${data.cabinClass}`);
  lines.push(`Email: ${data.email}`);

  return lines.join('\n');
}

export function generateFlightReceiptHTML(data: FlightReceiptData) {
  const stopsLabel =
    typeof data.stops === 'number'
      ? data.stops === 0
        ? 'Non stop'
        : `${data.stops} stop${data.stops > 1 ? 's' : ''}`
      : null;

  const infoRows = [
    ['Booking Reference', data.bookingReference],
    ['Booking Date', `${data.bookingDateLabel} at ${data.bookingTimeLabel}`],
    ['Route', `${data.fromCode} → ${data.toCode}`],
    ['From', `${data.fromCity} (${data.fromName})`],
    ['To', `${data.toCity} (${data.toName})`],
    data.airline ? ['Airline', data.airline] : null,
    data.flightNumber ? ['Flight Number', data.flightNumber] : null,
    data.departureDateLabel ? ['Departure', data.departureDateLabel] : null,
    data.arrivalDateLabel ? ['Arrival', data.arrivalDateLabel] : null,
    typeof data.durationMinutes === 'number'
      ? ['Duration', formatDuration(data.durationMinutes)]
      : null,
    stopsLabel ? ['Stops', stopsLabel] : null,
    ['Cabin Class', data.cabinClass],
    data.bookingClass ? ['Booking Class', data.bookingClass] : null,
    data.baggage ? ['Baggage', data.baggage] : null,
    ['Passengers', data.passengers],
    ['Passenger Name', data.passengerName],
    ['Email', data.email],
    data.phoneDisplay ? ['Phone', data.phoneDisplay] : null,
    typeof data.ticketPrice === 'number' ? ['Total Fare', formatFlightCurrency(data.ticketPrice)] : null,
    ['Status', 'CONFIRMED'],
  ].filter(Boolean) as [string, string][];

  const rowsHtml = infoRows
    .map(
      ([label, value]) => `
        <div class="info-row">
          <span class="info-label">${escapeHtml(label)}</span>
          <span class="info-value">${escapeHtml(value)}</span>
        </div>
      `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flight E-Ticket - ${escapeHtml(data.bookingReference)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 20px;
            background: #fff;
            color: #333;
          }
          .receipt-container {
            max-width: 600px;
            margin: 0 auto;
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 30px;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #FF7F00;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #FF7F00;
            margin-bottom: 10px;
          }
          .receipt-title {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
          }
          .receipt-subtitle {
            font-size: 14px;
            color: #666;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            background: #DCFCE7;
            color: #22C55E;
            margin: 16px 0 24px;
          }
          .reference {
            background: #F0FDF4;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            text-align: center;
            border: 1px solid #DCFCE7;
          }
          .reference-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 6px;
          }
          .reference-code {
            font-size: 18px;
            font-weight: bold;
            color: #22C55E;
            font-family: monospace;
            letter-spacing: 1px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
          }
          .info-row:last-child { border-bottom: none; }
          .info-label {
            font-size: 14px;
            color: #666;
            font-weight: 500;
            flex: 1;
          }
          .info-value {
            font-size: 14px;
            color: #333;
            font-weight: 600;
            text-align: right;
            flex: 1.2;
          }
          .amount-section {
            background: #FFF8F2;
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
            text-align: center;
            border: 1px solid #FFE4CC;
          }
          .amount-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 8px;
          }
          .amount-value {
            font-size: 28px;
            font-weight: bold;
            color: #FF7F00;
          }
          .footer {
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
            font-size: 12px;
            color: #999;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <div class="logo">NetPay</div>
            <div class="receipt-title">Flight E-Ticket</div>
            <div class="receipt-subtitle">${escapeHtml(data.bookingDateLabel)} at ${escapeHtml(data.bookingTimeLabel)}</div>
          </div>

          <div style="text-align:center;">
            <span class="status-badge">CONFIRMED</span>
          </div>

          <div class="reference">
            <div class="reference-label">Booking Reference</div>
            <div class="reference-code">${escapeHtml(data.bookingReference)}</div>
          </div>

          ${
            typeof data.ticketPrice === 'number'
              ? `
            <div class="amount-section">
              <div class="amount-label">Total Fare</div>
              <div class="amount-value">${escapeHtml(formatFlightCurrency(data.ticketPrice))}</div>
            </div>
          `
              : ''
          }

          <div class="transaction-info">
            ${rowsHtml}
          </div>

          <div class="footer">
            <p>Please arrive at the airport at least 2 hours before departure with a valid ID.</p>
            <p style="margin-top: 10px;">This is a computer-generated e-ticket. No signature is required.</p>
            <p style="margin-top: 10px;">Thank you for booking with NetPay!</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function createFlightReceiptPdf(data: FlightReceiptData) {
  const html = generateFlightReceiptHTML(data);
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: 612,
    height: 792,
  });

  const safeRef = data.bookingReference.replace(/[^a-zA-Z0-9-]/g, '');
  const targetUri = `${FileSystem.cacheDirectory}netpay-flight-${safeRef}.pdf`;

  if (uri !== targetUri) {
    await FileSystem.copyAsync({ from: uri, to: targetUri });
  }

  return targetUri;
}

export async function downloadFlightReceipt(data: FlightReceiptData) {
  try {
    const fileUri = await createFlightReceiptPdf(data);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save E-Ticket',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    Alert.alert('Success', 'Your e-ticket has been generated.');
  } catch (error) {
    console.error('Error downloading flight receipt:', error);
    Alert.alert('Download', 'Failed to generate e-ticket. Please try again.');
  }
}

export async function shareFlightReceipt(data: FlightReceiptData) {
  try {
    const fileUri = await createFlightReceiptPdf(data);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share E-Ticket',
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      message: buildFlightReceiptShareMessage(data),
      title: 'NetPay Flight Booking',
    });
  } catch (error) {
    console.error('Error sharing flight receipt:', error);
    try {
      await Share.share({
        message: buildFlightReceiptShareMessage(data),
        title: 'NetPay Flight Booking',
      });
    } catch {
      Alert.alert('Share', 'Unable to share booking details right now.');
    }
  }
}
