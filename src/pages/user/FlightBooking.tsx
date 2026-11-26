import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane } from "lucide-react";

export default function FlightBooking() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Flights</h1>
          <Button variant="ghost" onClick={() => navigate('/user/paybills')}>
            Back
          </Button>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center">
              <Plane className="w-8 h-8 text-brand" />
            </div>
            <CardTitle>Coming Soon</CardTitle>
            <CardDescription>
              Flight booking will be available in a future update. You can continue using Pay Bills for airtime, data,
              cable TV, education, electricity, and betting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/user/paybills')}>
              Back To Pay Bills
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
