import { Shield } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { LandingHeader } from "@/components/LandingHeader";
import { mobilePrivacyContent } from "@/utils/mobile-content-sync";

const LAST_UPDATED = "August 30, 2026";

const PrivacyLanding = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30">
      <LandingHeader />
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg">
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
              <p className="text-orange-100 text-lg">Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
          <p className="text-orange-50 max-w-3xl text-lg">
            How NetPay collects, uses, and protects your personal information on our website, Android app, and iOS app.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="bg-white rounded-lg shadow-md p-8">
          <MarkdownContent content={mobilePrivacyContent} />
        </div>
      </div>
    </div>
  );
};

export default PrivacyLanding;
