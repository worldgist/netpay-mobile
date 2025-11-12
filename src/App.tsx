import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import MobileNig from "./pages/MobileNig";
import Smeplug from "./pages/Smeplug";
import PayVessel from "./pages/PayVessel";
import ElectricityPlans from "./pages/ElectricityPlans";
import CableTvPlans from "./pages/CableTvPlans";
import EducationServices from "./pages/EducationServices";
import DataPlans from "./pages/DataPlans";
import AirtimeProviders from "./pages/AirtimeProviders";
import ContactUs from "./pages/ContactUs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import About from "./pages/About";
import Careers from "./pages/Careers";
import Pricing from "./pages/Pricing";
import FAQ from "./pages/FAQ";
import Security from "./pages/Security";
import HrManager from "./pages/HrManager";
import ComplianceOfficer from "./pages/ComplianceOfficer";
import SupportChat from "./pages/user/SupportChat";
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
import Transfer from "./pages/user/Transfer";
import TransactionDetails from "./pages/user/TransactionDetails";
import Referrals from "./pages/Referrals";
import ContentManagement from "./pages/ContentManagement";
import StaffManagement from "./pages/StaffManagement";
import UserNotifications from "./pages/user/UserNotifications";
import UserReferrals from "./pages/user/UserReferrals";
import UserContact from "./pages/user/UserContact";
import UserTerms from "./pages/user/UserTerms";
import UserPrivacy from "./pages/user/UserPrivacy";

const App = () => (
  <>
    <Toaster />
    <Sonner />
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mobilenig" element={<MobileNig />} />
        <Route path="/smeplug" element={<Smeplug />} />
        <Route path="/payvessel" element={<PayVessel />} />
        <Route path="/users" element={<Users />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/referrals" element={<Referrals />} />
        <Route path="/content" element={<ContentManagement />} />
        <Route path="/staff" element={<StaffManagement />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/hr" element={<HrManager />} />
        <Route path="/electricity" element={<ElectricityPlans />} />
        <Route path="/cable-tv" element={<CableTvPlans />} />
        <Route path="/education" element={<EducationServices />} />
        <Route path="/data-plans" element={<DataPlans />} />
        <Route path="/airtime" element={<AirtimeProviders />} />
        <Route path="/about" element={<About />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/security" element={<Security />} />
        <Route path="/hr" element={<HrManager />} />
        <Route path="/compliance" element={<ComplianceOfficer />} />
        
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
        <Route path="/user/transactions" element={<UserTransactions />} />
        <Route path="/user/transaction/:type/:id" element={<TransactionDetails />} />
        <Route path="/user/profile" element={<UserProfile />} />
        <Route path="/user/edit-profile" element={<EditProfile />} />
        <Route path="/user/notifications" element={<UserNotifications />} />
        <Route path="/user/referrals" element={<UserReferrals />} />
        <Route path="/user/contact" element={<UserContact />} />
        <Route path="/user/terms" element={<UserTerms />} />
        <Route path="/user/privacy" element={<UserPrivacy />} />
        <Route path="/user/support-chat" element={<SupportChat />} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </>
);

export default App;
