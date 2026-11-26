import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type AirportInfo = {
  code: string;
  name: string;
  city: string;
  country: string;
};

export type FlightOffer = {
  id: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  departureDateLabel: string;
  arrivalDateLabel: string;
  durationMinutes: number;
  stops: number;
  listPrice: number;
  ticketPrice: number;
  bookingClass: string;
  baggage: string;
  refundable: boolean;
  cabinClass: string;
  moreFlightsCount?: number;
};

export type FlightSort = 'cheapest' | 'fastest' | 'earliest' | 'direct';

export const FLIGHT_AIRPORTS: Record<string, AirportInfo> = {
  ABV: {
    code: 'ABV',
    name: 'Nnamdi Azikiwe International Airport',
    city: 'Abuja',
    country: 'Nigeria',
  },
  LOS: {
    code: 'LOS',
    name: 'Murtala Muhammed International Airport',
    city: 'Lagos',
    country: 'Nigeria',
  },
  PHC: {
    code: 'PHC',
    name: 'Port Harcourt International Airport',
    city: 'Port Harcourt',
    country: 'Nigeria',
  },
  KAN: {
    code: 'KAN',
    name: 'Mallam Aminu Kano International Airport',
    city: 'Kano',
    country: 'Nigeria',
  },
  ENU: {
    code: 'ENU',
    name: 'Akanu Ibiam International Airport',
    city: 'Enugu',
    country: 'Nigeria',
  },
};

const ABV_LOS_FLIGHTS: Omit<FlightOffer, 'departureDateLabel' | 'arrivalDateLabel'>[] = [
  {
    id: 'arik-734',
    airline: 'Arik Air',
    flightNumber: '734',
    departureTime: '6:25 PM',
    arrivalTime: '7:40 PM',
    durationMinutes: 75,
    stops: 0,
    listPrice: 113905,
    ticketPrice: 134289,
    bookingClass: 'M',
    baggage: '20 KG',
    refundable: false,
    cabinClass: 'Economy',
    moreFlightsCount: 1,
  },
  {
    id: 'enugu-102',
    airline: 'Enugu Air',
    flightNumber: '102',
    departureTime: '8:50 AM',
    arrivalTime: '10:05 AM',
    durationMinutes: 75,
    stops: 0,
    listPrice: 120101,
    ticketPrice: 138500,
    bookingClass: 'Y',
    baggage: '20 KG',
    refundable: false,
    cabinClass: 'Economy',
  },
  {
    id: 'united-ng-221',
    airline: 'United Nigeria',
    flightNumber: '221',
    departureTime: '7:25 PM',
    arrivalTime: '8:40 PM',
    durationMinutes: 75,
    stops: 0,
    listPrice: 123386,
    ticketPrice: 141200,
    bookingClass: 'M',
    baggage: '20 KG',
    refundable: true,
    cabinClass: 'Economy',
  },
  {
    id: 'aero-415',
    airline: 'Aero',
    flightNumber: '415',
    departureTime: '3:35 PM',
    arrivalTime: '4:50 PM',
    durationMinutes: 75,
    stops: 0,
    listPrice: 124743,
    ticketPrice: 142900,
    bookingClass: 'K',
    baggage: '20 KG',
    refundable: false,
    cabinClass: 'Economy',
  },
];

function formatDetailDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function withDateLabels(
  flights: Omit<FlightOffer, 'departureDateLabel' | 'arrivalDateLabel'>[],
  departureDate: Date
): FlightOffer[] {
  const datePart = formatDetailDate(departureDate);
  return flights.map((flight) => ({
    ...flight,
    departureDateLabel: `${datePart}, ${flight.departureTime}`,
    arrivalDateLabel: `${datePart}, ${flight.arrivalTime}`,
  }));
}

function buildGenericFlights(fromCode: string, toCode: string, departureDate: Date): FlightOffer[] {
  const base = withDateLabels(ABV_LOS_FLIGHTS, departureDate).map((flight, index) => ({
    ...flight,
    id: `${fromCode}-${toCode}-${flight.id}`,
    listPrice: flight.listPrice + index * 8500,
    ticketPrice: flight.ticketPrice + index * 9000,
  }));
  return base;
}

export function searchFlights(fromCode: string, toCode: string, departureDate: Date): FlightOffer[] {
  const key = `${fromCode}-${toCode}`;
  const cached = routeCache.get(key);
  if (cached) {
    return withDateLabels(cached, departureDate);
  }
  if (key === 'ABV-LOS' || key === 'LOS-ABV') {
    return withDateLabels(ABV_LOS_FLIGHTS, departureDate);
  }
  return buildGenericFlights(fromCode, toCode, departureDate);
}

type ManagedFlight = Omit<FlightOffer, 'departureDateLabel' | 'arrivalDateLabel'>;

const routeCache = new Map<string, ManagedFlight[]>();

function mapManagedFlight(row: {
  id: string;
  airline: string;
  flight_number: string;
  departure_time: string;
  arrival_time: string;
  duration_minutes: number;
  stops: number;
  list_price: number | string;
  ticket_price: number | string;
  booking_class: string;
  baggage: string;
  refundable: boolean;
  cabin_class: string;
  more_flights_count?: number | null;
}): ManagedFlight {
  return {
    id: row.id,
    airline: row.airline,
    flightNumber: row.flight_number,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    durationMinutes: row.duration_minutes,
    stops: row.stops,
    listPrice: Number(row.list_price),
    ticketPrice: Number(row.ticket_price),
    bookingClass: row.booking_class,
    baggage: row.baggage,
    refundable: row.refundable,
    cabinClass: row.cabin_class,
    moreFlightsCount: row.more_flights_count ?? undefined,
  };
}

export async function loadRouteFlights(fromCode: string, toCode: string, departureDate: Date): Promise<FlightOffer[]> {
  const key = `${fromCode}-${toCode}`;
  try {
    const { data, error } = await supabase
      .from('flights')
      .select(
        'id, airline, flight_number, departure_time, arrival_time, duration_minutes, stops, list_price, ticket_price, booking_class, baggage, refundable, cabin_class, more_flights_count'
      )
      .eq('from_code', fromCode)
      .eq('to_code', toCode)
      .eq('is_active', true)
      .order('ticket_price', { ascending: true });

    if (error) {
      return searchFlights(fromCode, toCode, departureDate);
    }

    const managed = (data || []).map((row) => mapManagedFlight(row as Parameters<typeof mapManagedFlight>[0]));
    routeCache.set(key, managed);
    return withDateLabels(managed, departureDate);
  } catch {
    return searchFlights(fromCode, toCode, departureDate);
  }
}

export function getFlightById(flightId: string, fromCode: string, toCode: string, departureDate: Date) {
  return searchFlights(fromCode, toCode, departureDate).find((flight) => flight.id === flightId) ?? null;
}

export function useFlightOffer(flightId: string, fromCode: string, toCode: string, departureDate: Date) {
  const [flight, setFlight] = useState<FlightOffer | null>(() =>
    getFlightById(flightId, fromCode, toCode, departureDate)
  );

  useEffect(() => {
    let cancelled = false;
    loadRouteFlights(fromCode, toCode, departureDate).then((offers) => {
      if (cancelled) return;
      setFlight(offers.find((item) => item.id === flightId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [departureDate, flightId, fromCode, toCode]);

  return flight;
}

export async function saveFlightBooking(input: {
  bookingReference: string;
  flightId: string;
  airline: string;
  flightNumber: string;
  fromCode: string;
  toCode: string;
  fromCity: string;
  toCity: string;
  departureAt: string;
  passengers: string;
  cabinClass: string;
  ticketPrice: number;
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<{ ok: boolean; bookingReference: string; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) {
    return { ok: false, bookingReference: input.bookingReference, error: 'Sign in to book a flight.' };
  }

  const flightId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.flightId)
    ? input.flightId
    : null;

  // Always load price from the flights table — never trust client ticketPrice.
  let ticketPrice = input.ticketPrice;
  let airline = input.airline;
  let flightNumber = input.flightNumber;
  let cabinClass = input.cabinClass;

  if (flightId) {
    const { data: flightRow, error: flightError } = await supabase
      .from('flights')
      .select('ticket_price, airline, flight_number, cabin_class, is_active')
      .eq('id', flightId)
      .maybeSingle();

    if (flightError) {
      return { ok: false, bookingReference: input.bookingReference, error: flightError.message };
    }
    if (!flightRow || flightRow.is_active === false) {
      return { ok: false, bookingReference: input.bookingReference, error: 'Selected flight is unavailable.' };
    }

    ticketPrice = Number(flightRow.ticket_price);
    if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
      return { ok: false, bookingReference: input.bookingReference, error: 'Flight price is unavailable.' };
    }
    airline = typeof flightRow.airline === 'string' ? flightRow.airline : airline;
    flightNumber = typeof flightRow.flight_number === 'string' ? flightRow.flight_number : flightNumber;
    cabinClass = typeof flightRow.cabin_class === 'string' ? flightRow.cabin_class : cabinClass;
  } else {
    return {
      ok: false,
      bookingReference: input.bookingReference,
      error: 'Invalid flight selection. Please search again and choose a flight.',
    };
  }

  let reference = input.bookingReference;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase.from('flight_bookings').insert({
      user_id: userId,
      flight_id: flightId,
      booking_reference: reference,
      airline,
      flight_number: flightNumber,
      from_code: input.fromCode,
      to_code: input.toCode,
      from_city: input.fromCity,
      to_city: input.toCity,
      departure_at: input.departureAt,
      passengers: input.passengers,
      cabin_class: cabinClass,
      ticket_price: ticketPrice,
      traveller_title: input.title,
      first_name: input.firstName,
      middle_name: input.middleName || null,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      // Pending until payment / admin confirmation — RLS rejects client "confirmed".
      status: 'pending',
    });
    if (!error) return { ok: true, bookingReference: reference };
    if (error.code !== '23505') {
      return { ok: false, bookingReference: reference, error: error.message };
    }
    reference = generateBookingReference();
  }

  return { ok: false, bookingReference: reference, error: 'Could not create a booking reference. Try again.' };
}

export function formatFlightCurrency(amount: number) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function parseTimeToMinutes(value: string) {
  const match = value.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function sortFlights(flights: FlightOffer[], sort: FlightSort): FlightOffer[] {
  const copy = [...flights];
  switch (sort) {
    case 'cheapest':
      return copy.sort((a, b) => a.listPrice - b.listPrice);
    case 'fastest':
      return copy.sort((a, b) => a.durationMinutes - b.durationMinutes);
    case 'earliest':
      return copy.sort((a, b) => parseTimeToMinutes(a.departureTime) - parseTimeToMinutes(b.departureTime));
    case 'direct':
      return copy.filter((flight) => flight.stops === 0).sort((a, b) => a.listPrice - b.listPrice);
    default:
      return copy;
  }
}

export function getAirport(code: string, fallback?: Partial<AirportInfo>): AirportInfo {
  if (FLIGHT_AIRPORTS[code]) return FLIGHT_AIRPORTS[code];
  return {
    code,
    name: fallback?.name || `${code} International Airport`,
    city: fallback?.city || code,
    country: fallback?.country || 'Nigeria',
  };
}

export function generateBookingReference(date = new Date()) {
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `NPF-${year}${month}${day}-${suffix}`;
}

export function formatBookingDateTime(date = new Date()) {
  const dateLabel = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return { dateLabel, timeLabel };
}

export function formatPhoneDisplay(phoneCode: string, phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '');
  if (phoneCode === '+234' && digits.length === 10) {
    return `${phoneCode} ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return `${phoneCode} ${phoneNumber}`.trim();
}

export type FareRuleSection = {
  title: string;
  items: string[];
};

export function getFareRulesForFlight(
  flight: FlightOffer,
  cabinClass: string,
  fromCode: string,
  toCode: string
): FareRuleSection[] {
  const changeFee = formatFlightCurrency(Math.round(flight.ticketPrice * 0.15));
  const cancelFee = flight.refundable ? formatFlightCurrency(Math.round(flight.ticketPrice * 0.25)) : 'Non-refundable';

  return [
    {
      title: 'Fare Summary',
      items: [
        `${flight.airline} • Flight ${flight.flightNumber}`,
        `Route: ${fromCode} → ${toCode}`,
        `Cabin: ${cabinClass}`,
        `Booking class: ${flight.bookingClass}`,
        `Checked baggage: ${flight.baggage}`,
        `Ticket price: ${formatFlightCurrency(flight.ticketPrice)}`,
      ],
    },
    {
      title: 'Changes & Cancellation',
      items: [
        flight.refundable
          ? `Tickets may be cancelled before departure. Cancellation fee applies: ${cancelFee}.`
          : 'This fare is non-refundable once ticketed.',
        `Date or time changes allowed before departure with a fee from ${changeFee}.`,
        'Name changes are not permitted after booking confirmation.',
        'No-show may result in forfeiture of the ticket value.',
      ],
    },
    {
      title: 'Baggage Rules',
      items: [
        `Included checked baggage allowance: ${flight.baggage}.`,
        'One cabin bag up to 7 kg may be carried onboard, subject to airline limits.',
        'Excess baggage charges apply at the airport if weight limits are exceeded.',
        'Sports equipment and special items require prior approval from the airline.',
      ],
    },
    {
      title: 'Check-in & Boarding',
      items: [
        'Online check-in opens 24 hours before departure.',
        'Airport check-in counters close 60 minutes before departure for domestic flights.',
        'Valid government-issued photo ID or passport must be presented at check-in.',
        'Boarding gates close 20 minutes before scheduled departure.',
      ],
    },
    {
      title: 'Important Notes',
      items: [
        'Fares are subject to availability and may change until payment is completed.',
        'NetPay acts as a booking agent; airline terms and conditions also apply.',
        'Schedule changes or delays are handled according to the operating carrier policy.',
        'For international routes, ensure your travel documents meet destination requirements.',
      ],
    },
  ];
}
