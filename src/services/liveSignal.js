export class LiveSignalError extends Error {
  constructor(message, details = {}) { super(message); this.name = "LiveSignalError"; Object.assign(this, details); }
}

export async function fetchLiveSignal({ user, location = "Tamil Nadu", latitude, longitude, signal = "trends" } = {}) {
  if (!user) throw new LiveSignalError("Sign in to use Live Signal.", { code: "unauthenticated", status: 401 });
  let token;
  try { token = await user.getIdToken(); } catch { throw new LiveSignalError("Your session expired. Please sign in again.", { code: "unauthenticated", status: 401 }); }
  const params = new URLSearchParams();
  if (location) params.set("location", location);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) { params.set("lat", String(latitude)); params.set("lon", String(longitude)); }
  if (signal) params.set("signal", signal);
  let response;
  try { response = await fetch(`/api/live-signal?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); }
  catch { throw new LiveSignalError("We could not reach Live Signal. Check your connection and try again.", { code: "network_error" }); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new LiveSignalError(payload.message || "Live Signal is temporarily unavailable. Please try again shortly.", { code: payload.code || "live_signal_unavailable", status: response.status });
  if (!Array.isArray(payload.topics) || !payload.topics.length) throw new LiveSignalError("No current topics are available for this location right now.", { code: "no_topics", status: 200 });
  return payload;
}
