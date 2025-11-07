import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";

const PrivacyPolicy = () => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Privacy Policy</h1>
            <p className="text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <Card>
            <CardContent className="prose prose-sm max-w-none p-6 space-y-6">
              <section>
                <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
                <p className="text-muted-foreground">
                  Welcome to NetPay. We respect your privacy and are committed to protecting your personal data. 
                  This privacy policy will inform you about how we look after your personal data and tell you 
                  about your privacy rights.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
                <p className="text-muted-foreground mb-2">We may collect, use, store and transfer different kinds of personal data about you:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Identity Data: first name, last name, username</li>
                  <li>Contact Data: email address, telephone numbers</li>
                  <li>Financial Data: payment card details, transaction history</li>
                  <li>Technical Data: IP address, browser type, device information</li>
                  <li>Usage Data: information about how you use our services</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
                <p className="text-muted-foreground mb-2">We use your personal data for the following purposes:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>To process your transactions and manage your account</li>
                  <li>To provide customer support and respond to inquiries</li>
                  <li>To send you service-related notifications</li>
                  <li>To improve our services and develop new features</li>
                  <li>To comply with legal obligations and prevent fraud</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">4. Data Security</h2>
                <p className="text-muted-foreground">
                  We have implemented appropriate security measures to prevent your personal data from being 
                  accidentally lost, used, or accessed in an unauthorized way. We limit access to your personal 
                  data to those employees and partners who have a business need to know.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
                <p className="text-muted-foreground">
                  We will only retain your personal data for as long as necessary to fulfill the purposes we 
                  collected it for, including for the purposes of satisfying any legal, accounting, or reporting 
                  requirements.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
                <p className="text-muted-foreground mb-2">You have the right to:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Request access to your personal data</li>
                  <li>Request correction of your personal data</li>
                  <li>Request erasure of your personal data</li>
                  <li>Object to processing of your personal data</li>
                  <li>Request restriction of processing your personal data</li>
                  <li>Request transfer of your personal data</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">7. Contact Us</h2>
                <p className="text-muted-foreground">
                  If you have any questions about this privacy policy or our privacy practices, please contact us at 
                  privacy@netpay.com
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default PrivacyPolicy;
