import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Phone, Tv, Wifi, GraduationCap, Zap, Dices, Plane } from "lucide-react";
import { FLIGHT_BOOKING_ENABLED } from "@/config/features";
import type { LucideIcon } from "lucide-react";

type Service = {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
};

export default function PayBills() {
  const navigate = useNavigate();

  const services: Service[] = [
    { id: "airtime", name: "Airtime", icon: Phone, path: "/user/purchase-airtime" },
    { id: "cable", name: "Cable TV", icon: Tv, path: "/user/purchase-cable-tv" },
    { id: "data", name: "Data", icon: Wifi, path: "/user/purchase-data" },
    { id: "education", name: "Education", icon: GraduationCap, path: "/user/purchase-education" },
    { id: "electricity", name: "Electricity", icon: Zap, path: "/user/purchase-electricity" },
    ...(FLIGHT_BOOKING_ENABLED
      ? [{ id: "flight", name: "Book Flights", icon: Plane, path: "/user/flight-booking" }]
      : []),
    { id: "betting", name: "Betting", icon: Dices, path: "/user/purchase-betting" },
  ];

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="border-b border-gray-200 px-6 pb-5 pt-8">
        <h1 className="text-[32px] font-extrabold leading-tight text-[#1E2533]">Pay Bills</h1>
        <p className="mt-1 text-base text-[#4E5A6D]">Select a service to continue</p>
      </div>

      <div className="px-5 pt-5">
        <div className="rounded-[20px] border-[1.5px] border-[#D1D5DB] bg-white p-4">
          <div className="grid grid-cols-2 gap-2.5">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => navigate(service.path)}
                  className="flex flex-col items-center justify-center rounded-2xl px-3 py-5 hover:bg-orange-50/60 transition-colors"
                >
                  <div className="mb-3 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#FFF5E9]">
                    <Icon className="h-7 w-7 text-[#FF7F00]" strokeWidth={2} />
                  </div>
                  <span className="text-center text-sm font-semibold text-[#152238]">
                    {service.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
