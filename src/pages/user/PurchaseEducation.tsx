import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";

interface EducationService {
  id: string;
  exam_type: string;
  service_name: string;
  price: number;
  api_code: string;
}

const PurchaseEducation = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [services, setServices] = useState<EducationService[]>([]);
  const [selectedExamType, setSelectedExamType] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);

  const EXAM_TYPES = ["WAEC", "JAMB", "NECO"];

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate('/user/auth');
          return;
        }

        // Fetch balance
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }

        // Fetch education services
        const { data: servicesData, error: servicesError } = await supabase
          .from('education_services')
          .select('*')
          .order('exam_type', { ascending: true })
          .order('service_name', { ascending: true });
        
        if (servicesError) throw servicesError;
        
        if (servicesData) {
          setServices(servicesData);
        }

        setLoading(false);

        // Subscribe to balance updates
        const channel = supabase
          .channel('balance-changes')
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${session.user.id}`
          }, (payload) => {
            setBalance(payload.new.balance || 0);
          })
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error('Error fetching initial data:', error);
        toast({
          title: "Error",
          description: "Failed to load data. Please refresh the page.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [navigate, toast]);

  const getExamLogo = (examType: string) => {
    const logos: Record<string, string> = {
      'WAEC': '/waec.png',
      'JAMB': '/jamb.png',
      'NECO': '/neco.png'
    };
    return logos[examType.toUpperCase()] || '';
  };

  const filteredServices = services.filter(s => s.exam_type === selectedExamType);
  const selectedServiceData = services.find(s => s.id === selectedService);

  const handlePurchase = () => {
    if (!phoneNumber || !selectedService) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (!selectedServiceData) return;

    if (balance < selectedServiceData.price) {
      toast({
        title: "Insufficient Balance",
        description: "Please fund your wallet to continue",
        variant: "destructive",
      });
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      if (!selectedServiceData) throw new Error("Invalid service");

      // Call purchase edge function (to be created)
      const { data, error } = await supabase.functions.invoke('purchase-education', {
        body: {
          phone_number: phoneNumber,
          exam_type: selectedServiceData.exam_type,
          service_id: selectedServiceData.id,
          api_code: selectedServiceData.api_code,
          amount: selectedServiceData.price
        }
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Purchase failed');
      }

      setTransactionDetails(data.data);
      setShowSuccess(true);

      // Refresh balance
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setBalance(profile.balance || 0);
        }
      }

      toast({
        title: "Success",
        description: "Education service purchased successfully",
      });
    } catch (error: any) {
      console.error('Error purchasing education service:', error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to purchase service. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  const handleDone = () => {
    setShowSuccess(false);
    navigate('/user/transactions');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Education Services</h1>
          <Button variant="ghost" onClick={() => navigate('/user/paybills')}>
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Available Balance</CardTitle>
            <CardDescription className="text-2xl font-bold text-primary">
              {formatNaira(balance)}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select Exam Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {EXAM_TYPES.map((examType) => (
                <button
                  key={examType}
                  type="button"
                  className={`aspect-square rounded-lg border-2 p-2 transition-all hover:scale-105 flex flex-col items-center justify-center gap-1 ${
                    selectedExamType === examType 
                      ? 'border-primary ring-2 ring-primary ring-offset-2' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => {
                    setSelectedExamType(examType);
                    setSelectedService("");
                  }}
                >
                  <img 
                    src={getExamLogo(examType)} 
                    alt={examType}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-xs font-medium">{examType}</span>
                </button>
              ))}
            </div>

            {selectedExamType && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="service">Select Service</Label>
                  <select
                    id="service"
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                  >
                    <option value="">Choose a service...</option>
                    {filteredServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.service_name} - {formatNaira(service.price)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="08012345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    maxLength={11}
                  />
                </div>

                <Button 
                  className="w-full" 
                  onClick={handlePurchase}
                  disabled={!selectedService || !phoneNumber || purchasing}
                >
                  {purchasing ? "Processing..." : "Continue"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Purchase Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>
              Please review your purchase details
            </DialogDescription>
          </DialogHeader>
          {selectedServiceData && (
            <div className="space-y-4">
              <div className="flex justify-center py-4">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <img 
                    src={getExamLogo(selectedServiceData.exam_type)} 
                    alt={selectedServiceData.exam_type}
                    className="w-14 h-14 object-contain"
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <span>Exam Type:</span>
                <span className="font-semibold">{selectedServiceData.exam_type}</span>
              </div>
              <div className="flex justify-between">
                <span>Service:</span>
                <span className="font-semibold">{selectedServiceData.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Phone Number:</span>
                <span className="font-semibold">{phoneNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-semibold">{formatNaira(selectedServiceData.price)}</span>
              </div>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={() => setShowSummary(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleConfirmPayment} className="flex-1" disabled={purchasing}>
                  {purchasing ? "Processing..." : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Successful!</DialogTitle>
            <DialogDescription>
              Your education service has been purchased successfully
            </DialogDescription>
          </DialogHeader>
          {transactionDetails && selectedServiceData && (
            <div className="space-y-4">
              <div className="flex justify-center py-4">
                <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center">
                  <img 
                    src={getExamLogo(selectedServiceData.exam_type)} 
                    alt={selectedServiceData.exam_type}
                    className="w-16 h-16 object-contain"
                  />
                </div>
              </div>
              {transactionDetails.pin && (
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">PIN</p>
                  <p className="text-lg font-mono font-bold">{transactionDetails.pin}</p>
                </div>
              )}
              <div className="flex justify-between">
                <span>Reference:</span>
                <span className="font-semibold">{transactionDetails.reference}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-semibold">{formatNaira(transactionDetails.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>New Balance:</span>
                <span className="font-semibold">{formatNaira(transactionDetails.balance_after)}</span>
              </div>
              <Button onClick={handleDone} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseEducation;
