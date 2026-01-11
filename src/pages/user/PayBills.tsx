import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { Phone, Tv, Wifi, GraduationCap, Zap, DicesIcon } from "lucide-react";

export default function PayBills() {
  const navigate = useNavigate();

  const services = [
    { id: "airtime", name: "Airtime", icon: Phone, path: "/user/purchase-airtime" },
    { id: "cable", name: "Cable_tv", icon: Tv, path: "/user/purchase-cable-tv" },
    { id: "data", name: "Data", icon: Wifi, path: "/user/purchase-data" },
    { id: "education", name: "Education", icon: GraduationCap, path: "/user/purchase-education" },
    { id: "electricity", name: "Electricity", icon: Zap, path: "/user/purchase-electricity" },
    { id: "betting", name: "Betting", icon: DicesIcon, path: "/user/purchase-betting" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Pay Bills</h1>
      </div>

      {/* Content */}
      <div className="px-6 pt-6">
        <h2 className="text-2xl font-bold text-brand mb-2">Pay Bills</h2>
        <p className="text-gray-600 mb-6">Select a service to continue</p>

        <div className="grid grid-cols-3 gap-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <button
                key={service.id}
                onClick={() => navigate(service.path)}
                className="bg-white rounded-2xl p-6 flex flex-col items-center justify-center hover:shadow-lg transition-shadow"
              >
                <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-3">
                  <Icon className="w-8 h-8 text-brand" />
                </div>
                <span className="text-sm font-medium text-gray-900 text-center">
                  {service.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
