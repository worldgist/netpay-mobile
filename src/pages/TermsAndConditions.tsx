import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";

const TermsAndConditions = () => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Terms and Conditions</h1>
            <p className="text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <Card>
            <CardContent className="prose prose-sm max-w-none p-6 space-y-6">
              <section>
                <h2 className="text-xl font-semibold mb-3">1. Agreement to Terms</h2>
                <p className="text-muted-foreground">
                  By accessing or using NetPay services, you agree to be bound by these Terms and Conditions. 
                  If you disagree with any part of these terms, you may not access our services.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">2. Services</h2>
                <p className="text-muted-foreground mb-2">NetPay provides the following services:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Airtime purchase and recharge</li>
                  <li>Data bundle subscriptions</li>
                  <li>Electricity bill payments</li>
                  <li>Cable TV subscriptions</li>
                  <li>Education service payments</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">3. Account Registration</h2>
                <p className="text-muted-foreground mb-2">To use our services, you must:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Provide accurate and complete registration information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Notify us immediately of any unauthorized access</li>
                  <li>Be responsible for all activities under your account</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">4. Transaction Terms</h2>
                <p className="text-muted-foreground mb-2">When making transactions:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>All transactions are subject to available balance</li>
                  <li>Service fees and commissions apply as displayed</li>
                  <li>Transactions are final once completed</li>
                  <li>Refunds are processed according to our refund policy</li>
                  <li>We reserve the right to refuse or cancel any transaction</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">5. User Responsibilities</h2>
                <p className="text-muted-foreground mb-2">You agree to:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Use services only for lawful purposes</li>
                  <li>Not engage in fraudulent activities</li>
                  <li>Not attempt to gain unauthorized access to our systems</li>
                  <li>Not interfere with the proper functioning of our services</li>
                  <li>Comply with all applicable laws and regulations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">6. Limitations of Liability</h2>
                <p className="text-muted-foreground">
                  NetPay shall not be liable for any indirect, incidental, special, consequential, or punitive 
                  damages resulting from your use of or inability to use our services. We do not guarantee 
                  uninterrupted or error-free service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">7. Service Modifications</h2>
                <p className="text-muted-foreground">
                  We reserve the right to modify, suspend, or discontinue any part of our services at any time 
                  without prior notice. We may also update these terms and conditions periodically.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">8. Termination</h2>
                <p className="text-muted-foreground">
                  We may terminate or suspend your account immediately, without prior notice, for any breach 
                  of these Terms and Conditions. Upon termination, your right to use our services will cease 
                  immediately.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">9. Governing Law</h2>
                <p className="text-muted-foreground">
                  These Terms shall be governed by and construed in accordance with the laws of Nigeria, 
                  without regard to its conflict of law provisions.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">10. Contact Information</h2>
                <p className="text-muted-foreground">
                  For questions about these Terms and Conditions, please contact us at legal@netpay.com
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default TermsAndConditions;
