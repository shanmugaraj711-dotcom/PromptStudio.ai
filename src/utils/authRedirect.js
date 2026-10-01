const AUTH_PAGES = new Set(["/login", "/signup", "/forgot-password"]);

/**
 * Where to send a user after they sign in or sign up. ProtectedRoute stores the page
 * they were trying to open in `location.state.from`; keep its query string and hash so
 * e.g. /builder?mode=image does not silently become the plain builder.
 */
export function getReturnPath(state, fallback = "/dashboard") {
  const from = state?.from;
  const pathname = typeof from?.pathname === "string" ? from.pathname : "";
  if (!pathname.startsWith("/") || pathname.startsWith("//") || AUTH_PAGES.has(pathname)) return fallback;
  return `${pathname}${from.search || ""}${from.hash || ""}`;
}
