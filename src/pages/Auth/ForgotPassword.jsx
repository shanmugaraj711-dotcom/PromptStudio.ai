import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const { resetPassword } = useAuth();

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-not-found":
        return "No account found with this email address.";
      case "auth/too-many-requests":
        return "Too many requests. Please try again later.";
      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";
      default:
        return "Failed to send password reset email. Please try again.";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(email.trim());
      setSuccessMessage(
        "If an account exists with this email, a password reset link has been sent."
      );
      setEmail("");
    } catch (err) {
      setError(getFriendlyErrorMessage(err?.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-gray-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-blue-400">
          PromptStudio AI
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Reset your password
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gray-900 py-8 px-4 shadow-2xl rounded-xl sm:px-10 border border-gray-800">
          {error && (
            <div className="mb-4 p-3 bg-red-950/80 border border-red-500/50 rounded-lg text-red-200 text-sm flex items-start">
              <span className="mr-2">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-950/80 border border-green-500/50 rounded-lg text-green-200 text-sm flex items-start">
              <span className="mr-2">✅</span>
              <span>{successMessage}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-300">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded-lg shadow-sm py-2.5 px-3.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Sending reset link...</span>
                </div>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Remembered your password?{" "}
            <Link
              to="/login"
              className="font-semibold text-blue-400 hover:text-indigo-300"
            >
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
