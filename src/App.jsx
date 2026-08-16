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
import { ProtectedRoute } from "./components/ProtectedRoute";
import PromptHistory from "./pages/Result/PromptHistory";
import AppLayout from "./components/layout/AppLayout";

const withAppLayout = (element) => <ProtectedRoute><AppLayout>{element}</AppLayout></ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/p/:id" element={<SharedPrompt />} />

      <Route path="/dashboard" element={withAppLayout(<Dashboard />)} />
      <Route path="/builder" element={withAppLayout(<PromptBuilder />)} />
      <Route path="/workflows" element={withAppLayout(<WorkflowLibrary />)} />
      <Route path="/account" element={withAppLayout(<Account />)} />
      <Route path="/history" element={withAppLayout(<PromptHistory />)} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
