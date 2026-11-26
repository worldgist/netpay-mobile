-- Flights admins can publish, and the bookings customers make from them.

CREATE TABLE IF NOT EXISTS public.flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airline TEXT NOT NULL,
  flight_number TEXT NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  stops INTEGER NOT NULL DEFAULT 0 CHECK (stops >= 0),
  list_price NUMERIC(12, 2) NOT NULL CHECK (list_price >= 0),
  ticket_price NUMERIC(12, 2) NOT NULL CHECK (ticket_price >= 0),
  booking_class TEXT NOT NULL DEFAULT 'Y',
  baggage TEXT NOT NULL DEFAULT '20 KG',
  refundable BOOLEAN NOT NULL DEFAULT false,
  cabin_class TEXT NOT NULL DEFAULT 'Economy',
  more_flights_count INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flights_route_active_idx
  ON public.flights (from_code, to_code, is_active);

CREATE TABLE IF NOT EXISTS public.flight_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flight_id UUID REFERENCES public.flights(id) ON DELETE SET NULL,
  booking_reference TEXT NOT NULL UNIQUE,
  airline TEXT NOT NULL,
  flight_number TEXT NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  from_city TEXT,
  to_city TEXT,
  departure_at TIMESTAMPTZ NOT NULL,
  passengers TEXT NOT NULL DEFAULT '1 Adult',
  cabin_class TEXT NOT NULL DEFAULT 'Economy',
  ticket_price NUMERIC(12, 2) NOT NULL CHECK (ticket_price >= 0),
  traveller_title TEXT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flight_bookings_user_id_idx
  ON public.flight_bookings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS flight_bookings_status_idx
  ON public.flight_bookings (status, created_at DESC);

ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view active flights" ON public.flights;
CREATE POLICY "Users can view active flights"
ON public.flights
FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can view all flights" ON public.flights;
CREATE POLICY "Admins can view all flights"
ON public.flights
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert flights" ON public.flights;
CREATE POLICY "Admins can insert flights"
ON public.flights
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update flights" ON public.flights;
CREATE POLICY "Admins can update flights"
ON public.flights
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete flights" ON public.flights;
CREATE POLICY "Admins can delete flights"
ON public.flights
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own flight bookings" ON public.flight_bookings;
CREATE POLICY "Users can view own flight bookings"
ON public.flight_bookings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own flight bookings" ON public.flight_bookings;
CREATE POLICY "Users can create own flight bookings"
ON public.flight_bookings
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view flight bookings" ON public.flight_bookings;
CREATE POLICY "Admins can view flight bookings"
ON public.flight_bookings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update flight bookings" ON public.flight_bookings;
CREATE POLICY "Admins can update flight bookings"
ON public.flight_bookings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.flights (
  airline, flight_number, from_code, to_code, departure_time, arrival_time,
  duration_minutes, stops, list_price, ticket_price, booking_class, baggage,
  refundable, cabin_class, more_flights_count
)
SELECT *
FROM (
  VALUES
    ('Arik Air', '734', 'ABV', 'LOS', '6:25 PM', '7:40 PM', 75, 0, 113905::numeric, 134289::numeric, 'M', '20 KG', false, 'Economy', 1),
    ('Enugu Air', '102', 'ABV', 'LOS', '8:50 AM', '10:05 AM', 75, 0, 120101::numeric, 138500::numeric, 'Y', '20 KG', false, 'Economy', NULL::integer),
    ('United Nigeria', '221', 'ABV', 'LOS', '7:25 PM', '8:40 PM', 75, 0, 123386::numeric, 141200::numeric, 'M', '20 KG', true, 'Economy', NULL::integer),
    ('Aero', '415', 'ABV', 'LOS', '3:35 PM', '4:50 PM', 75, 0, 124743::numeric, 142900::numeric, 'K', '20 KG', false, 'Economy', NULL::integer),
    ('Arik Air', '735', 'LOS', 'ABV', '8:30 PM', '9:45 PM', 75, 0, 113905::numeric, 134289::numeric, 'M', '20 KG', false, 'Economy', 1),
    ('Enugu Air', '103', 'LOS', 'ABV', '11:20 AM', '12:35 PM', 75, 0, 120101::numeric, 138500::numeric, 'Y', '20 KG', false, 'Economy', NULL::integer),
    ('United Nigeria', '222', 'LOS', 'ABV', '9:10 PM', '10:25 PM', 75, 0, 123386::numeric, 141200::numeric, 'M', '20 KG', true, 'Economy', NULL::integer),
    ('Aero', '416', 'LOS', 'ABV', '5:15 PM', '6:30 PM', 75, 0, 124743::numeric, 142900::numeric, 'K', '20 KG', false, 'Economy', NULL::integer)
) AS seed (
  airline, flight_number, from_code, to_code, departure_time, arrival_time,
  duration_minutes, stops, list_price, ticket_price, booking_class, baggage,
  refundable, cabin_class, more_flights_count
)
WHERE NOT EXISTS (SELECT 1 FROM public.flights);
