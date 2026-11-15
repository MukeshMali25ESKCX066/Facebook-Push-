import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Hero3D from "./components/Hero3D";
import ToolsSection from "./components/ToolsSection";
import HowItWorks from "./components/HowItWorks";
import UniqueContent from "./components/UniqueContent";
import SmartScheduling from "./components/SmartScheduling";
import CampaignAnalytics from "./components/CampaignAnalytics";
import PricingFooter from "./components/PricingFooter";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ApprovalPending from "./pages/ApprovalPending";
import SuperAdmin from "./pages/SuperAdmin";
import AuthProvider from "./AuthProvider";
import "./index.css";
import "./LuxuryTheme.css";

function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero3D />
        <ToolsSection />
        <HowItWorks />
        <UniqueContent />
        <SmartScheduling />
        <CampaignAnalytics />
        <PricingFooter />
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/suuperadmin" element={<SuperAdmin />} />
          <Route path="/admin" element={<SuperAdmin />} />
          <Route path="/approval-pending" element={<ApprovalPending />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Navigate to="/legacy#dashboard" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
