export async function fetchLiveSignal({ user, location = "Tamil Nadu", latitude, longitude, signal = "trends" } = {}) {
  if (!user) throw new Error("Sign in to use Live Signal.");
  const token = await user.getIdToken();
  const params = new URLSearchParams();
  if (location) params.set("location", location);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    params.set("lat", String(latitude));
    params.set("lon", String(longitude));
  }
  if (signal) params.set("signal", signal);
  const response = await fetch(`/api/live-signal?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Live Signal is temporarily unavailable.");
  return payload;
}
