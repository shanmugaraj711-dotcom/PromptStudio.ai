export async function fetchRuntimeProductConfig(user) {
  if (!user) return null;
  const token = await user.getIdToken();
  const response = await fetch("/api/product-config", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load current product configuration.");
  const payload = await response.json();
  return payload?.config || null;
}
