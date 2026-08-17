import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing/Landing";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import Dashboard from "./pages/Dashboard/Dashboard";
import Account from "./pages/Account/Account";
import PromptBuilder from "./pages/Builder/PromptBuilder";
import SharedPrompt from "./pages/SharedPrompt/SharedPrompt";
import WorkflowLibrary from "./pages/Workflows/WorkflowLibrary";
import Admin from "./pages/Admin/Admin";
import About from "./pages/About/About";
import Help from "./pages/Help/Help";
import Feedback from "./pages/Feedback/Feedback";
import Contact from "./pages/Contact/Contact";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RuntimeFeatureRoute } from "./components/RuntimeFeatureRoute";
import PromptHistory from "./pages/Result/PromptHistory";
import AppLayout from "./components/layout/AppLayout";
import SupportWidget from "./components/support/SupportWidget";

const withAppLayout = (element) => <ProtectedRoute><AppLayout>{element}</AppLayout></ProtectedRoute>;
const withRuntimeFeature = (feature, element) => <ProtectedRoute><RuntimeFeatureRoute feature={feature}><AppLayout>{element}</AppLayout></RuntimeFeatureRoute></ProtectedRoute>;

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/p/:id" element={<SharedPrompt />} />
        <Route path="/about" element={<About />} />
        <Route path="/help" element={<Help />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/feedback" element={<Feedback />} />

        <Route path="/dashboard" element={withAppLayout(<Dashboard />)} />
        <Route path="/builder" element={withAppLayout(<PromptBuilder />)} />
        <Route path="/workflows" element={withAppLayout(<WorkflowLibrary />)} />
        <Route path="/account" element={withAppLayout(<Account />)} />
        <Route path="/history" element={withRuntimeFeature("promptHistory", <PromptHistory />)} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SupportWidget />
    </>
  );
}
