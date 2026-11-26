import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { format } from "date-fns";

type FlightRow = {
  id: string;
  airline: string;
  flight_number: string;
  from_code: string;
  to_code: string;
  departure_time: string;
  arrival_time: string;
  duration_minutes: number;
  stops: number;
  list_price: number;
  ticket_price: number;
  booking_class: string;
  baggage: string;
  refundable: boolean;
  cabin_class: string;
  more_flights_count: number | null;
  is_active: boolean;
};

type BookingRow = {
  id: string;
  booking_reference: string;
  airline: string;
  flight_number: string;
  from_code: string;
  to_code: string;
  from_city: string | null;
  to_city: string | null;
  departure_at: string;
  passengers: string;
  cabin_class: string;
  ticket_price: number;
  traveller_title: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

type FlightForm = {
  airline: string;
  flight_number: string;
  from_code: string;
  to_code: string;
  departure_time: string;
  arrival_time: string;
  duration_minutes: string;
  stops: string;
  list_price: string;
  ticket_price: string;
  booking_class: string;
  baggage: string;
  refundable: boolean;
  cabin_class: string;
  more_flights_count: string;
  is_active: boolean;
};

const EMPTY_FORM: FlightForm = {
  airline: "",
  flight_number: "",
  from_code: "ABV",
  to_code: "LOS",
  departure_time: "8:00 AM",
  arrival_time: "9:15 AM",
  duration_minutes: "75",
  stops: "0",
  list_price: "",
  ticket_price: "",
  booking_class: "Y",
  baggage: "20 KG",
  refundable: false,
  cabin_class: "Economy",
  more_flights_count: "",
  is_active: true,
};

const CABIN_OPTIONS = ["Economy", "Premium Economy", "Business", "First Class"];

function formFromFlight(flight: FlightRow): FlightForm {
  return {
    airline: flight.airline,
    flight_number: flight.flight_number,
    from_code: flight.from_code,
    to_code: flight.to_code,
    departure_time: flight.departure_time,
    arrival_time: flight.arrival_time,
    duration_minutes: String(flight.duration_minutes),
    stops: String(flight.stops),
    list_price: String(flight.list_price),
    ticket_price: String(flight.ticket_price),
    booking_class: flight.booking_class,
    baggage: flight.baggage,
    refundable: flight.refundable,
    cabin_class: flight.cabin_class,
    more_flights_count: flight.more_flights_count == null ? "" : String(flight.more_flights_count),
    is_active: flight.is_active,
  };
}

export default function FlightManagement() {
  const { toast } = useToast();
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [flightSearch, setFlightSearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FlightForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFlights();
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [statusFilter]);

  const fetchFlights = async () => {
    try {
      setLoadingFlights(true);
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .order("from_code", { ascending: true })
        .order("ticket_price", { ascending: true });
      if (error) throw error;
      setFlights((data || []) as FlightRow[]);
    } catch (error) {
      toast({
        title: "Could not load flights",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingFlights(false);
    }
  };

  const fetchBookings = async () => {
    try {
      setLoadingBookings(true);
      let query = supabase
        .from("flight_bookings")
        .select("*, profiles(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      setBookings((data || []) as BookingRow[]);
    } catch (error) {
      toast({
        title: "Could not load bookings",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingBookings(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (flight: FlightRow) => {
    setEditingId(flight.id);
    setForm(formFromFlight(flight));
    setDialogOpen(true);
  };

  const saveFlight = async () => {
    const airline = form.airline.trim();
    const flightNumber = form.flight_number.trim();
    const fromCode = form.from_code.trim().toUpperCase();
    const toCode = form.to_code.trim().toUpperCase();
    const listPrice = Number(form.list_price);
    const ticketPrice = Number(form.ticket_price);
    const duration = Number(form.duration_minutes);
    const stops = Number(form.stops);
    const extra = form.more_flights_count.trim();

    if (!airline || !flightNumber) {
      toast({ title: "Airline and flight number are required", variant: "destructive" });
      return;
    }
    if (!/^[A-Z]{3}$/.test(fromCode) || !/^[A-Z]{3}$/.test(toCode) || fromCode === toCode) {
      toast({ title: "Enter two different 3-letter airport codes", variant: "destructive" });
      return;
    }
    if (!form.departure_time.trim() || !form.arrival_time.trim()) {
      toast({ title: "Departure and arrival times are required", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(listPrice) || !Number.isFinite(ticketPrice) || listPrice < 0 || ticketPrice < 0) {
      toast({ title: "Enter valid prices", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(stops) || stops < 0) {
      toast({ title: "Enter a valid duration and stop count", variant: "destructive" });
      return;
    }

    const payload = {
      airline,
      flight_number: flightNumber,
      from_code: fromCode,
      to_code: toCode,
      departure_time: form.departure_time.trim(),
      arrival_time: form.arrival_time.trim(),
      duration_minutes: duration,
      stops,
      list_price: listPrice,
      ticket_price: ticketPrice,
      booking_class: form.booking_class.trim() || "Y",
      baggage: form.baggage.trim() || "20 KG",
      refundable: form.refundable,
      cabin_class: form.cabin_class,
      more_flights_count: extra === "" ? null : Number(extra),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);
      const { error } = editingId
        ? await supabase.from("flights").update(payload).eq("id", editingId)
        : await supabase.from("flights").insert(payload);
      if (error) throw error;
      toast({ title: editingId ? "Flight updated" : "Flight added" });
      setDialogOpen(false);
      await fetchFlights();
    } catch (error) {
      toast({
        title: "Could not save flight",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (flight: FlightRow) => {
    const { error } = await supabase
      .from("flights")
      .update({ is_active: !flight.is_active, updated_at: new Date().toISOString() })
      .eq("id", flight.id);
    if (error) {
      toast({ title: "Could not update flight", description: error.message, variant: "destructive" });
      return;
    }
    setFlights((current) =>
      current.map((item) => (item.id === flight.id ? { ...item, is_active: !flight.is_active } : item)),
    );
  };

  const deleteFlight = async (flight: FlightRow) => {
    const confirmed = window.confirm(`Remove ${flight.airline} ${flight.flight_number} (${flight.from_code}–${flight.to_code})?`);
    if (!confirmed) return;
    const { error } = await supabase.from("flights").delete().eq("id", flight.id);
    if (error) {
      toast({ title: "Could not delete flight", description: error.message, variant: "destructive" });
      return;
    }
    setFlights((current) => current.filter((item) => item.id !== flight.id));
  };

  const updateBookingStatus = async (booking: BookingRow, status: string) => {
    const { error } = await supabase
      .from("flight_bookings")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", booking.id);
    if (error) {
      toast({ title: "Could not update booking", description: error.message, variant: "destructive" });
      return;
    }
    setBookings((current) => current.map((item) => (item.id === booking.id ? { ...item, status } : item)));
  };

  const filteredFlights = useMemo(() => {
    const query = flightSearch.trim().toLowerCase();
    if (!query) return flights;
    return flights.filter((flight) =>
      [flight.airline, flight.flight_number, flight.from_code, flight.to_code, flight.cabin_class]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [flightSearch, flights]);

  const filteredBookings = useMemo(() => {
    const query = bookingSearch.trim().toLowerCase();
    if (!query) return bookings;
    return bookings.filter((booking) => {
      const name = [booking.traveller_title, booking.first_name, booking.middle_name, booking.last_name]
        .filter(Boolean)
        .join(" ");
      return [booking.booking_reference, name, booking.email, booking.phone, booking.airline, booking.from_code, booking.to_code]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [bookingSearch, bookings]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Flight Management</h1>
            </div>
          </header>

          <div className="p-6">
            <Tabs defaultValue="flights" className="space-y-6">
              <TabsList>
                <TabsTrigger value="flights">Flights</TabsTrigger>
                <TabsTrigger value="bookings">Bookings</TabsTrigger>
              </TabsList>

              <TabsContent value="flights">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle>Published flights</CardTitle>
                        <CardDescription>
                          These routes appear in Pay Bills when customers search. Turn a flight off to hide it.
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={fetchFlights} disabled={loadingFlights}>
                          <RefreshCw className={`h-4 w-4 mr-2 ${loadingFlights ? "animate-spin" : ""}`} />
                          Refresh
                        </Button>
                        <Button size="sm" onClick={openCreate}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add flight
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="relative max-w-sm mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-10"
                        placeholder="Search airline, number, or route"
                        value={flightSearch}
                        onChange={(event) => setFlightSearch(event.target.value)}
                      />
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Flight</TableHead>
                            <TableHead>Route</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Ticket</TableHead>
                            <TableHead>Cabin</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingFlights ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground">
                                Loading flights...
                              </TableCell>
                            </TableRow>
                          ) : filteredFlights.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground">
                                No flights yet. Add one to show it in Pay Bills.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredFlights.map((flight) => (
                              <TableRow key={flight.id}>
                                <TableCell>
                                  <div className="font-medium">{flight.airline}</div>
                                  <div className="text-xs text-muted-foreground">{flight.flight_number}</div>
                                </TableCell>
                                <TableCell>
                                  {flight.from_code} → {flight.to_code}
                                  <div className="text-xs text-muted-foreground">
                                    {flight.stops === 0 ? "Non stop" : `${flight.stops} stop`} • {flight.baggage}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {flight.departure_time} – {flight.arrival_time}
                                  <div className="text-xs text-muted-foreground">{flight.duration_minutes} min</div>
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{formatNaira(Number(flight.ticket_price))}</div>
                                  <div className="text-xs text-muted-foreground">
                                    List {formatNaira(Number(flight.list_price))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {flight.cabin_class}
                                  <div className="text-xs text-muted-foreground">
                                    Class {flight.booking_class}
                                    {flight.refundable ? " • Refundable" : ""}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Switch checked={flight.is_active} onCheckedChange={() => toggleActive(flight)} />
                                    <Badge variant={flight.is_active ? "default" : "secondary"}>
                                      {flight.is_active ? "Live" : "Hidden"}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(flight)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => deleteFlight(flight)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bookings">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle>Flight bookings</CardTitle>
                        <CardDescription>Confirm, complete, or cancel a customer booking.</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={fetchBookings} disabled={loadingBookings}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loadingBookings ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                      <div className="relative flex-1 min-w-[220px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-10"
                          placeholder="Search reference, name, or route"
                          value={bookingSearch}
                          onChange={(event) => setBookingSearch(event.target.value)}
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Reference</TableHead>
                            <TableHead>Traveller</TableHead>
                            <TableHead>Flight</TableHead>
                            <TableHead>Departure</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Booked</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingBookings ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground">
                                Loading bookings...
                              </TableCell>
                            </TableRow>
                          ) : filteredBookings.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground">
                                No flight bookings yet.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredBookings.map((booking) => {
                              const name = [booking.traveller_title, booking.first_name, booking.middle_name, booking.last_name]
                                .filter(Boolean)
                                .join(" ");
                              return (
                                <TableRow key={booking.id}>
                                  <TableCell className="font-mono text-xs">{booking.booking_reference}</TableCell>
                                  <TableCell>
                                    <div className="font-medium">{name}</div>
                                    <div className="text-xs text-muted-foreground">{booking.email}</div>
                                    <div className="text-xs text-muted-foreground">{booking.phone}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      {booking.airline} {booking.flight_number}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {booking.from_code} → {booking.to_code} • {booking.cabin_class} • {booking.passengers}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {format(new Date(booking.departure_at), "MMM dd, yyyy HH:mm")}
                                  </TableCell>
                                  <TableCell className="font-medium">{formatNaira(Number(booking.ticket_price))}</TableCell>
                                  <TableCell>
                                    <Select
                                      value={booking.status}
                                      onValueChange={(value) => updateBookingStatus(booking, value)}
                                    >
                                      <SelectTrigger className="w-[140px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="confirmed">Confirmed</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="cancelled">Cancelled</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {format(new Date(booking.created_at), "MMM dd, yyyy HH:mm")}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit flight" : "Add flight"}</DialogTitle>
            <DialogDescription>Customers see active flights when they search this route.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Airline</Label>
              <Input value={form.airline} onChange={(event) => setForm({ ...form, airline: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Flight number</Label>
              <Input
                value={form.flight_number}
                onChange={(event) => setForm({ ...form, flight_number: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                maxLength={3}
                value={form.from_code}
                onChange={(event) => setForm({ ...form, from_code: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                maxLength={3}
                value={form.to_code}
                onChange={(event) => setForm({ ...form, to_code: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label>Departs</Label>
              <Input
                placeholder="6:25 PM"
                value={form.departure_time}
                onChange={(event) => setForm({ ...form, departure_time: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Arrives</Label>
              <Input
                placeholder="7:40 PM"
                value={form.arrival_time}
                onChange={(event) => setForm({ ...form, arrival_time: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                inputMode="numeric"
                value={form.duration_minutes}
                onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Stops</Label>
              <Input inputMode="numeric" value={form.stops} onChange={(event) => setForm({ ...form, stops: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>List price (₦)</Label>
              <Input
                inputMode="decimal"
                value={form.list_price}
                onChange={(event) => setForm({ ...form, list_price: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Ticket price (₦)</Label>
              <Input
                inputMode="decimal"
                value={form.ticket_price}
                onChange={(event) => setForm({ ...form, ticket_price: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Booking class</Label>
              <Input
                value={form.booking_class}
                onChange={(event) => setForm({ ...form, booking_class: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label>Baggage</Label>
              <Input value={form.baggage} onChange={(event) => setForm({ ...form, baggage: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cabin</Label>
              <Select value={form.cabin_class} onValueChange={(value) => setForm({ ...form, cabin_class: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABIN_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Extra flights on this airline</Label>
              <Input
                inputMode="numeric"
                placeholder="Optional"
                value={form.more_flights_count}
                onChange={(event) => setForm({ ...form, more_flights_count: event.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Refundable</Label>
              <Switch checked={form.refundable} onCheckedChange={(checked) => setForm({ ...form, refundable: checked })} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>Visible to customers</Label>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveFlight} disabled={saving}>
              {saving ? "Saving..." : "Save flight"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
