import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);

  const { login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case "auth/invalid-email": return "Please enter a valid email address.";
      case "auth/user-disabled": return "This account has been disabled. Please contact support.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Invalid email or password.";
      case "auth/too-many-requests": return "Too many failed attempts. Please try again later.";
      case "auth/popup-closed-by-user": return "Google sign-in popup was closed before completing.";
      case "auth/network-request-failed": return "Network error. Please check your internet connection.";
      default: return "Failed to authenticate. Please check your details and try again.";
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault(); setError(""); setSuccessMessage(""); setIsSubmitting(true);
    try { await login(email, password); navigate(from, { replace: true }); }
    catch (err) { setError(getFriendlyErrorMessage(err?.code)); }
    finally { setIsSubmitting(false); }
  };

  const handleGoogleLogin = async () => {
    setError(""); setSuccessMessage(""); setIsSubmitting(true);
    try { await loginWithGoogle(); navigate(from, { replace: true }); }
    catch (err) { setError(getFriendlyErrorMessage(err?.code)); }
    finally { setIsSubmitting(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault(); setError(""); setSuccessMessage("");
    if (!email) { setError("Please enter your email address to reset your password."); return; }
    setIsSubmitting(true);
    try { await resetPassword(email); setSuccessMessage("Password reset email sent! Check your inbox."); setIsResetMode(false); }
    catch (err) { setError(getFriendlyErrorMessage(err?.code)); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-gray-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-indigo-400">PromptStudio AI</h1>
        <p className="mt-2 text-sm text-gray-400">{isResetMode ? "Reset your password" : "Sign in to your account"}</p>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gray-900 py-8 px-4 shadow-2xl rounded-xl sm:px-10 border border-gray-800">
          {error && <div className="mb-4 p-3 bg-red-950/80 border border-red-500/50 rounded-lg text-red-200 text-sm flex items-start"><span className="mr-2">⚠️</span><span>{error}</span></div>}
          {successMessage && <div className="mb-4 p-3 bg-green-950/80 border border-green-500/50 rounded-lg text-green-200 text-sm flex items-start"><span className="mr-2">✅</span><span>{successMessage}</span></div>}

          {!isResetMode ? (
            <form className="space-y-6" onSubmit={handleEmailLogin}>
              <div>
                <label className="block text-sm font-medium text-gray-300">Email address</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded-lg shadow-sm py-2.5 px-3.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-300">Password</label>
                  <button type="button" onClick={() => { setError(""); setSuccessMessage(""); setIsResetMode(true); }} className="text-xs font-medium text-indigo-400 hover:text-indigo-300 focus:outline-none">Forgot password?</button>
                </div>
                <div className="relative mt-1">
                  <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="block w-full bg-gray-800 border border-gray-700 rounded-lg shadow-sm py-2.5 pl-3.5 pr-12 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm" />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-200 focus:outline-none focus:text-indigo-300" title={showPassword ? "Hide password" : "Show password"}>{showPassword ? "🙈" : "👁️"}</button>
                </div>
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isSubmitting ? <div className="flex items-center space-x-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Signing in...</span></div> : "Sign In"}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleResetPassword}>
              <div><label className="block text-sm font-medium text-gray-300">Email address</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 block w-full bg-gray-800 border border-gray-700 rounded-lg shadow-sm py-2.5 px-3.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm" /></div>
              <div className="flex flex-col space-y-3">
                <button type="submit" disabled={isSubmitting} className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{isSubmitting ? <div className="flex items-center space-x-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Sending Email...</span></div> : "Send Password Reset Email"}</button>
                <button type="button" onClick={() => { setError(""); setSuccessMessage(""); setIsResetMode(false); }} className="w-full py-2 px-4 border border-gray-700 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors focus:outline-none">Back to Sign In</button>
              </div>
            </form>
          )}

          {!isResetMode && <div className="mt-6">
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-800" /></div><div className="relative flex justify-center text-xs uppercase"><span className="px-2 bg-gray-900 text-gray-400">Or continue with</span></div></div>
            <div className="mt-6"><button type="button" onClick={handleGoogleLogin} disabled={isSubmitting} className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-700 rounded-lg shadow-sm text-sm font-medium text-gray-200 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg><span>Continue with Google</span></button></div>
          </div>}
          <p className="mt-6 text-center text-xs text-gray-400">Don't have an account?{" "}<Link to="/signup" className="font-semibold text-indigo-400 hover:text-indigo-300">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
