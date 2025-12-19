import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfileExists } from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { InsufficientBalanceModal } from "@/components/InsufficientBalanceModal";

interface EducationService {
  id: string;
  exam_type: string;
  service_name: string;
  price: number;
  api_code: string | null;
  service_id: string;
  vtpass_code?: string | null;
  vending_provider?: string | null;
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
  const [jambProfileId, setJambProfileId] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);

  const EXAM_TYPES = ["WAEC", "NECO", "JAMB"];

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          navigate('/user/auth');
          return;
        }

        await ensureProfileExists(session.user);

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
          .select('id, exam_type, service_name, price, api_code, service_id, vtpass_code, vending_provider, is_active')
          .eq('is_active', true)
          .order('price', { ascending: true })
          .order('exam_type', { ascending: true })
          .order('service_name', { ascending: true });
        
        if (servicesError) throw servicesError;
        
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
    if (!selectedService) {
      toast({
        title: "Error",
        description: "Please select a service",
        variant: "destructive",
      });
      return;
    }

    // For JAMB, require Profile Code; for WAEC/NECO, phone number is optional
    if (selectedExamType === "JAMB") {
      if (!jambProfileId.trim()) {
        toast({
          title: "Error",
          description: "Please enter your JAMB Profile Code",
          variant: "destructive",
        });
        return;
      }
    }
    // Phone number is optional for WAEC/NECO - the function handles it automatically

    if (!selectedServiceData) return;

    if (balance < selectedServiceData.price) {
      setShowInsufficientBalance(true);
      return;
    }

    setShowSummary(true);
  };

  const handleConfirmPayment = async () => {
    setPurchasing(true);
    setShowSummary(false);

    try {
      if (!selectedServiceData) throw new Error("Invalid service");

      // Prepare request body - function will extract variation_code from service row if not provided
      const requestBody: any = {
        exam_type: selectedServiceData.exam_type,
        education_service_id: selectedServiceData.id,
        amount: selectedServiceData.price,
        quantity: 1,
      };

      // Pass variation_code if available (function will use vtpass_code from DB if not provided)
      // For VTpass services, variation_code should be lowercase (e.g., "utme-mock", "utme-no-mock")
      if (selectedServiceData.vtpass_code) {
        requestBody.variation_code = selectedServiceData.vtpass_code.toLowerCase();
      } else if (selectedServiceData.api_code) {
        // Also pass api_code as fallback (function will convert to lowercase for VTpass if needed)
        requestBody.api_code = selectedServiceData.api_code;
      }
      
      // Service ID is optional - function will get it from service row
      if (selectedServiceData.service_id) {
        requestBody.service_id = selectedServiceData.service_id;
      }

      // For JAMB, include Profile Code (billers_code)
      // For WAEC/NECO, no additional fields needed
      if (selectedServiceData.exam_type === "JAMB") {
        requestBody.billers_code = jambProfileId.trim();
        requestBody.phone_number = phoneNumber || ""; // Optional for JAMB
      }
      
      // Add quantity (defaults to 1 in function if not provided)
      requestBody.quantity = 1;

      // Call purchase edge function
      const { data, error } = await supabase.functions.invoke('purchase-education', {
        body: requestBody
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

        {/* Exam Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Exam Type</CardTitle>
            <CardDescription>Choose the type of exam result checker you need</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              {EXAM_TYPES.map((examType) => {
                  const logo = getExamLogo(examType);
                  const examServices = services.filter(s => s.exam_type === examType);
                  return (
                    <Card
                      key={examType}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedExamType === examType ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedExamType(examType)}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        {logo && (
                          <img 
                            src={logo} 
                            alt={examType}
                            className="w-12 h-12 object-contain"
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{examType}</h3>
                          <p className="text-sm text-muted-foreground">
                            {examServices.length > 0 
                              ? `${examServices.length} service${examServices.length > 1 ? 's' : ''} available`
                              : 'No services available'
                            }
                          </p>
                        </div>
                        {selectedExamType === examType && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Service Selection */}
        {selectedExamType && (
                <Card>
                  <CardHeader>
                    <CardTitle>Select Service</CardTitle>
                    <CardDescription>Choose a service for {selectedExamType}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {filteredServices.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No services available for {selectedExamType}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredServices.map((service) => (
                          <Card
                            key={service.id}
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedService === service.id ? 'ring-2 ring-primary' : ''
                            }`}
                            onClick={() => setSelectedService(service.id)}
                          >
                            <CardContent className="flex items-center justify-between p-4">
                              <div className="flex-1">
                                <h3 className="font-semibold">
                                  {service.exam_type === "WAEC" 
                                    ? "WAEC Result Checker PIN" 
                                    : service.exam_type === "NECO"
                                    ? "NECO Result Checker PIN"
                                    : service.service_name
                                  }
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {service.api_code && `Code: ${service.api_code}`}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-lg">{formatNaira(service.price)}</p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

        {/* Input Fields */}
        {selectedExamType && selectedService && selectedExamType === "JAMB" && (
          <Card>
            <CardHeader>
              <CardTitle>Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jambProfileId">JAMB Profile Code *</Label>
                <Input
                  id="jambProfileId"
                  placeholder="Enter your JAMB Profile Code"
                  value={jambProfileId}
                  onChange={(e) => setJambProfileId(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Your JAMB Profile Code is required for JAMB registration
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number (Optional)</Label>
                <Input
                  id="phoneNumber"
                  placeholder="Enter phone number (optional)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  type="tel"
                />
                <p className="text-xs text-muted-foreground">
                  Phone number is optional for JAMB registration
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Purchase Button */}
        {selectedExamType && selectedService && (
          <Button
            onClick={handlePurchase}
            className="w-full"
            size="lg"
            disabled={purchasing}
          >
            {purchasing ? "Processing..." : `Purchase ${
              selectedServiceData?.exam_type === "WAEC" 
                ? "WAEC Result Checker PIN" 
                : selectedServiceData?.exam_type === "NECO"
                ? "NECO Result Checker PIN"
                : selectedServiceData?.service_name || ''
            }`}
          </Button>
        )}
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
                <span className="font-semibold">{
                  selectedServiceData.exam_type === "WAEC" 
                    ? "WAEC Result Checker PIN" 
                    : selectedServiceData.exam_type === "NECO"
                    ? "NECO Result Checker PIN"
                    : selectedServiceData.service_name
                }</span>
              </div>
              {selectedServiceData.exam_type === "JAMB" && (
                <div className="flex justify-between">
                  <span>JAMB Profile Code:</span>
                  <span className="font-semibold">{jambProfileId}</span>
                </div>
              )}
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
              {transactionDetails.pins && transactionDetails.pins.length > 0 && (
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground mb-2">PIN Details</p>
                  {transactionDetails.pins.map((pinData: any, index: number) => (
                    <div key={index} className="border-b border-border pb-2 last:border-0 last:pb-0">
                      {pinData.Serial && (
                        <div className="mb-1">
                          <span className="text-xs text-muted-foreground">Serial: </span>
                          <span className="font-mono font-semibold">{pinData.Serial}</span>
                        </div>
                      )}
                      {pinData.Pin && (
                        <div>
                          <span className="text-xs text-muted-foreground">PIN: </span>
                          <span className="font-mono font-bold text-lg">{pinData.Pin}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {transactionDetails.pin && !transactionDetails.pins && (
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

      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onOpenChange={setShowInsufficientBalance}
        currentBalance={balance}
        requiredAmount={services.find(s => s.id === selectedService)?.price}
      />
    </div>
  );
};

export default PurchaseEducation;
