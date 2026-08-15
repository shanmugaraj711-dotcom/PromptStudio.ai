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
import { ProtectedRoute } from "./components/ProtectedRoute";
import PromptHistory from "./pages/Result/PromptHistory";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/p/:id" element={<SharedPrompt />} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/builder" element={<ProtectedRoute><PromptBuilder /></ProtectedRoute>} />
      <Route path="/workflows" element={<ProtectedRoute><WorkflowLibrary /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><PromptHistory /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
