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
import UserAuth from "./pages/user/UserAuth";
import UserDashboard from "./pages/user/UserDashboard";
import AddMoney from "./pages/user/AddMoney";
import PayBills from "./pages/user/PayBills";
import UserTransactions from "./pages/user/UserTransactions";
import UserProfile from "./pages/user/UserProfile";
import SetupPin from "./pages/user/SetupPin";
import ForgotPassword from "./pages/user/ForgotPassword";
import EditProfile from "./pages/user/EditProfile";
import VerifyEmail from "./pages/user/VerifyEmail";
import PurchaseAirtime from "./pages/user/PurchaseAirtime";
import PurchaseData from "./pages/user/PurchaseData";
import PurchaseCableTv from "./pages/user/PurchaseCableTv";
import PurchaseEducation from "./pages/user/PurchaseEducation";
import PurchaseElectricity from "./pages/user/PurchaseElectricity";
import PurchaseBetting from "./pages/user/PurchaseBetting";
import FlightBooking from "./pages/user/FlightBooking";
import Transfer from "./pages/user/Transfer";
import TransactionDetails from "./pages/user/TransactionDetails";
import Referrals from "./pages/Referrals";
import ContentManagement from "./pages/ContentManagement";
import StaffManagement from "./pages/StaffManagement";
import SupportAdmin from "./pages/SupportAdmin";
import UserNotifications from "./pages/user/UserNotifications";
import UserReferrals from "./pages/user/UserReferrals";
import UserContact from "./pages/user/UserContact";
import UserTerms from "./pages/user/UserTerms";
import UserPrivacy from "./pages/user/UserPrivacy";
import DeleteAccount from "./pages/user/DeleteAccount";
import StatementOfAccount from "./pages/user/StatementOfAccount";
import { WebHostAccessGuard } from "@/components/WebHostAccessGuard";
import AppLinkRedirect from "@/pages/AppLinkRedirect";
import { VendingSettingsProvider } from "@/contexts/VendingSettingsContext";

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
        <Route path="/" element={<Index />} />
        <Route path="/reset-password" element={<AppLinkRedirect />} />
        <Route path="/pay" element={<AppLinkRedirect />} />
        <Route path="/open/*" element={<AppLinkRedirect />} />
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
        <Route path="/about" element={<About />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/support-admin" element={<SupportAdmin />} />
        <Route path="/contact-us" element={<ContactLanding />} />
        <Route path="/privacy" element={<PrivacyLanding />} />
        <Route path="/terms" element={<TermsLanding />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/security" element={<Security />} />
        <Route path="/compliance" element={<ComplianceOfficer />} />
        <Route path="/admin/privacy" element={<PrivacyPolicy />} />
        <Route path="/admin/terms" element={<TermsAndConditions />} />
        
        {/* User-facing pages */}
        <Route path="/user/auth" element={<UserAuth />} />
        <Route path="/user/verify-email" element={<VerifyEmail />} />
        <Route path="/user/setup-pin" element={<SetupPin />} />
        <Route path="/user/forgot-password" element={<ForgotPassword />} />
        <Route path="/user/dashboard" element={<UserDashboard />} />
        <Route path="/user/add-money" element={<AddMoney />} />
        <Route path="/user/transfer" element={<Transfer />} />
        <Route path="/user/paybills" element={<PayBills />} />
        <Route path="/user/purchase-airtime" element={<PurchaseAirtime />} />
        <Route path="/user/purchase-data" element={<PurchaseData />} />
        <Route path="/user/purchase-cable-tv" element={<PurchaseCableTv />} />
        <Route path="/user/purchase-electricity" element={<PurchaseElectricity />} />
        <Route path="/user/purchase-education" element={<PurchaseEducation />} />
        <Route path="/user/purchase-betting" element={<PurchaseBetting />} />
        <Route path="/user/flight-booking" element={<FlightBooking />} />
        <Route path="/user/transactions" element={<UserTransactions />} />
        <Route path="/user/transaction/:type/:id" element={<TransactionDetails />} />
        <Route path="/user/profile" element={<UserProfile />} />
        <Route path="/user/edit-profile" element={<EditProfile />} />
        <Route path="/user/notifications" element={<UserNotifications />} />
        <Route path="/user/referrals" element={<UserReferrals />} />
        <Route path="/user/contact" element={<UserContact />} />
        <Route path="/user/terms" element={<UserTerms />} />
        <Route path="/user/privacy" element={<UserPrivacy />} />
        <Route path="/user/statement-of-account" element={<StatementOfAccount />} />
        <Route path="/user/delete-account" element={<DeleteAccount />} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
      </WebHostAccessGuard>
    </BrowserRouter>
    </VendingSettingsProvider>
  </>
);

export default App;
