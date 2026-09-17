import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import DeletedAccounts from "./pages/DeletedAccounts";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import EmailNotifications from "./pages/EmailNotifications";
import Settings from "./pages/Settings";
import Smeplug from "./pages/Smeplug";
import EBills from "./pages/EBills";
import PayVessel from "./pages/PayVessel";
import MobileNig from "./pages/MobileNig";
import Flutterwave from "./pages/Flutterwave";
import ElectricityPlans from "./pages/ElectricityPlans";
import CableTvPlans from "./pages/CableTvPlans";
import EducationServices from "./pages/EducationServices";
import BettingManagement from "./pages/BettingManagement";
import PlatformRevenue from "./pages/PlatformRevenue";
import Treasury from "./pages/Treasury";
import Ledger from "./pages/Ledger";
import WalletManagement from "./pages/WalletManagement";
import VirtualAccounts from "./pages/VirtualAccounts";
import DataPlans from "./pages/DataPlans";
import AirtimeProviders from "./pages/AirtimeProviders";
import ImportCableTransactions from "./pages/ImportCableTransactions";
import ContactLanding from "./pages/ContactLanding";
import PrivacyLanding from "./pages/PrivacyLanding";
import TermsLanding from "./pages/TermsLanding";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import About from "./pages/About";
import Careers from "./pages/Careers";
import Pricing from "./pages/Pricing";
import FAQ from "./pages/FAQ";
import Security from "./pages/Security";
import HrManager from "./pages/HrManager";
import ComplianceOfficer from "./pages/ComplianceOfficer";
import NotFound from "./pages/NotFound";
import Referrals from "./pages/Referrals";
import ContentManagement from "./pages/ContentManagement";
import StaffManagement from "./pages/StaffManagement";
import SupportAdmin from "./pages/SupportAdmin";
import ExpoWebRedirect from "./pages/user/ExpoWebRedirect";
import UserAuthExpoRedirect from "./pages/user/UserAuthExpoRedirect";
import { expoWebRoutes } from "./config/site";
import { WebHostAccessGuard } from "@/components/WebHostAccessGuard";
import AppLinkRedirect from "./pages/AppLinkRedirect";
import { VendingSettingsProvider } from "@/contexts/VendingSettingsContext";

/** Customer app UI lives on Expo web — Vite only redirects. */
function ExpoRoute({ path, fallback }: { path: string; fallback?: string }) {
  return <ExpoWebRedirect path={path} fallbackSitePath={fallback} />;
}

/**
 * Vite owns: marketing landing + admin (/auth, /dashboard, admin tools).
 * Expo web owns: customer login/signup and all wallet / pay-bills features.
 */
const App = () => (
  <>
    <Toaster />
    <Sonner />
    <VendingSettingsProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <WebHostAccessGuard>
          <Routes>
            {/* Marketing (Vite) */}
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact-us" element={<ContactLanding />} />
            <Route path="/privacy" element={<PrivacyLanding />} />
            <Route path="/terms" element={<TermsLanding />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/security" element={<Security />} />
            <Route path="/compliance" element={<ComplianceOfficer />} />

            {/* Deep links → native / Expo app */}
            <Route path="/reset-password" element={<AppLinkRedirect />} />
            <Route path="/pay" element={<AppLinkRedirect />} />
            <Route path="/open/*" element={<AppLinkRedirect />} />

            {/* Admin (Vite only) */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/smeplug" element={<Smeplug />} />
            <Route path="/ebills" element={<EBills />} />
            <Route path="/payvessel" element={<PayVessel />} />
            <Route path="/mobilenig" element={<MobileNig />} />
            <Route path="/flutterwave" element={<Flutterwave />} />
            <Route path="/users" element={<Users />} />
            <Route path="/deleted-accounts" element={<DeletedAccounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/referrals" element={<Referrals />} />
            <Route path="/content" element={<ContentManagement />} />
            <Route path="/staff" element={<StaffManagement />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/email-notifications" element={<EmailNotifications />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/hr" element={<HrManager />} />
            <Route path="/electricity" element={<ElectricityPlans />} />
            <Route path="/cable-tv" element={<CableTvPlans />} />
            <Route path="/import-cable-transactions" element={<ImportCableTransactions />} />
            <Route path="/education" element={<EducationServices />} />
            <Route path="/betting" element={<BettingManagement />} />
            <Route path="/platform-revenue" element={<PlatformRevenue />} />
            <Route path="/treasury" element={<Treasury />} />
            <Route path="/wallets" element={<WalletManagement />} />
            <Route path="/virtual-accounts" element={<VirtualAccounts />} />
            <Route path="/wallet-management" element={<Navigate to="/wallets" replace />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/ledger/" element={<Ledger />} />
            <Route path="/admin/ledger" element={<Ledger />} />
            <Route path="/admin/ledger/" element={<Navigate to="/ledger" replace />} />
            <Route path="/data-plans" element={<DataPlans />} />
            <Route path="/airtime" element={<AirtimeProviders />} />
            <Route path="/support-admin" element={<SupportAdmin />} />
            <Route path="/admin/privacy" element={<PrivacyPolicy />} />
            <Route path="/admin/terms" element={<TermsAndConditions />} />

            {/* Customer web app → Expo (never Vite user UIs) */}
            <Route path="/user/auth" element={<UserAuthExpoRedirect />} />
            <Route path="/user/verify-email" element={<ExpoRoute path={expoWebRoutes.emailVerification} fallback="/open/verify-email" />} />
            <Route path="/user/setup-pin" element={<ExpoRoute path={expoWebRoutes.setupPin} fallback="/open/app" />} />
            <Route path="/user/forgot-password" element={<ExpoRoute path={expoWebRoutes.forgetPassword} fallback="/open/app" />} />
            <Route path="/user/dashboard" element={<ExpoRoute path={expoWebRoutes.home} fallback="/open/app" />} />
            <Route path="/user/add-money" element={<ExpoRoute path={expoWebRoutes.addMoney} fallback="/open/app" />} />
            <Route path="/user/transfer" element={<ExpoRoute path={expoWebRoutes.transfer} fallback="/open/app" />} />
            <Route path="/user/paybills" element={<ExpoRoute path={expoWebRoutes.payBills} fallback="/pay?screen=pay_bills" />} />
            <Route path="/user/purchase-airtime" element={<ExpoRoute path={expoWebRoutes.airtime} fallback="/pay?screen=airtime" />} />
            <Route path="/user/purchase-data" element={<ExpoRoute path={expoWebRoutes.data} fallback="/pay?screen=data_purchase" />} />
            <Route path="/user/purchase-cable-tv" element={<ExpoRoute path={expoWebRoutes.cable} fallback="/pay?screen=cable_tv" />} />
            <Route path="/user/purchase-electricity" element={<ExpoRoute path={expoWebRoutes.electricity} fallback="/pay?screen=electricity" />} />
            <Route path="/user/purchase-education" element={<ExpoRoute path={expoWebRoutes.education} fallback="/pay?screen=education" />} />
            <Route path="/user/purchase-betting" element={<ExpoRoute path={expoWebRoutes.betting} fallback="/pay?screen=betting" />} />
            <Route path="/user/flight-booking" element={<ExpoRoute path={expoWebRoutes.flight} fallback="/pay?screen=flight_booking" />} />
            <Route path="/user/transactions" element={<ExpoRoute path={expoWebRoutes.transactions} fallback="/open/app" />} />
            <Route path="/user/transaction/:type/:id" element={<ExpoRoute path={expoWebRoutes.transactions} fallback="/open/app" />} />
            <Route path="/user/profile" element={<ExpoRoute path={expoWebRoutes.profile} fallback="/open/app" />} />
            <Route path="/user/security" element={<ExpoRoute path={expoWebRoutes.security} fallback="/open/app" />} />
            <Route path="/user/edit-profile" element={<ExpoRoute path={expoWebRoutes.editProfile} fallback="/open/app" />} />
            <Route path="/user/notifications" element={<ExpoRoute path={expoWebRoutes.notifications} fallback="/open/app" />} />
            <Route path="/user/referrals" element={<ExpoRoute path={expoWebRoutes.referral} fallback="/open/app" />} />
            <Route path="/user/contact" element={<ExpoRoute path={expoWebRoutes.contact} fallback="/open/app" />} />
            <Route path="/user/terms" element={<ExpoRoute path={expoWebRoutes.terms} fallback="/open/app" />} />
            <Route path="/user/privacy" element={<ExpoRoute path={expoWebRoutes.privacy} fallback="/open/app" />} />
            <Route path="/user/statement-of-account" element={<ExpoRoute path={expoWebRoutes.statement} fallback="/open/app" />} />
            <Route path="/user/delete-account" element={<ExpoRoute path={expoWebRoutes.deleteAccount} fallback="/open/app" />} />
            <Route path="/user/*" element={<ExpoRoute path={expoWebRoutes.home} fallback="/open/app" />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </WebHostAccessGuard>
      </BrowserRouter>
    </VendingSettingsProvider>
  </>
);

export default App;
