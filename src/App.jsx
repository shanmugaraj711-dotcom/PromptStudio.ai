import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing/Landing";

import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ForgotPassword from "./pages/Auth/ForgotPassword";

import Dashboard from "./pages/Dashboard/Dashboard";
import Account from "./pages/Account/Account";
import PromptBuilder from "./pages/Builder/PromptBuilder";

import { ProtectedRoute } from "./components/ProtectedRoute";
import PromptHistory from "./pages/Result/PromptHistory";

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/builder"
        element={
          <ProtectedRoute>
            <PromptBuilder />
          </ProtectedRoute>
        }
      />

      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <PromptHistory />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
