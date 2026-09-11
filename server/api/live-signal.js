import { requireUser, json } from "./_firebaseAdmin.js";

const GEO_CODES = {
  "tamil nadu": "IN-TN", tamilnadu: "IN-TN", chennai: "IN-TN", coimbatore: "IN-TN", madurai: "IN-TN", tiruchirappalli: "IN-TN", salem: "IN-TN",
  kerala: "IN-KL", karnataka: "IN-KA", "andhra pradesh": "IN-AP", telangana: "IN-TG", maharashtra: "IN-MH", delhi: "IN-DL", india: "IN",
};

const clean = (value, max = 80) => String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
const providerError = (message, code = "provider_unavailable") => Object.assign(new Error(message), { status: 503, code });

const decodeTrends = (text) => {
  const raw = String(text || "").replace(/^\)\]\}',?\s*/, "");
  const data = JSON.parse(raw);
  const day = data?.default?.trendingSearchesDays?.[0];
  return (day?.trendingSearches || []).slice(0, 8).map((item, index) => ({
    rank: index + 1,
    title: clean(item?.title?.query, 120),
    traffic: clean(item?.formattedTraffic || "Trending", 40),
    description: clean(item?.articles?.[0]?.snippet || "Trending now in this region.", 180),
    url: item?.articles?.[0]?.url || "",
  })).filter((item) => item.title);
};

const decodeNews = (xml, location) => {
  const items = [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8);
  return items.map((match, index) => {
    const block = match[1];
    const read = (tag) => { const found = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")); return found ? found[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : ""; };
    const title = clean(read("title"), 120);
    return { rank: index + 1, title, traffic: "Live topic", description: `${location} coverage`, url: read("link") };
  }).filter((item) => item.title);
};

const withTimeout = async (url, ms = 6500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": "PromptStudioAI/1.0 LiveSignal" } });
  } catch (error) {
    if (error?.name === "AbortError") throw providerError("Live Signal took too long to receive fresh data.", "provider_timeout");
    throw providerError("Live Signal could not reach its live data source.", "provider_network_error");
  } finally { clearTimeout(timer); }
};

const fetchNewsTopics = async (location) => {
  const query = encodeURIComponent(`${location} when:1d`);
  const response = await withTimeout(`https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`);
  if (!response.ok) throw providerError("Live Signal could not retrieve current topics for this location.");
  const topics = decodeNews(await response.text(), location);
  if (!topics.length) throw providerError("No current topics are available for this location right now.", "no_topics");
  return topics;
};

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { code: "method_not_allowed", message: "Live Signal uses GET requests." });
  try {
    await requireUser(req);
    const requestedLocation = clean(req.query?.location || "Tamil Nadu");
    const lat = Number(req.query?.lat);
    const lon = Number(req.query?.lon);
    let location = requestedLocation || "Tamil Nadu";

    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      try {
        const geoResponse = await withTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`, 4500);
        if (geoResponse.ok) {
          const geo = await geoResponse.json();
          location = clean(geo?.principalSubdivision || geo?.city || geo?.locality || location);
        }
      } catch (error) {
        console.warn("[live-signal] reverse geocode unavailable", { code: error?.code || "unknown" });
      }
    }

    const geoCode = GEO_CODES[location.toLowerCase()];
    let topics = [];
    let source = "google-trends";

    if (geoCode) {
      try {
        const response = await withTimeout(`https://trends.google.com/trends/api/dailytrends?hl=en-IN&tz=-330&geo=${encodeURIComponent(geoCode)}&ns=15`);
        if (!response.ok) throw providerError("The live trend source is temporarily unavailable.");
        topics = decodeTrends(await response.text());
        if (!topics.length) throw providerError("The live trend source returned no current topics.", "no_topics");
      } catch (error) {
        console.warn("[live-signal] Google Trends failed; using Google News fallback", { location, code: error?.code || "unknown" });
        try {
          topics = await fetchNewsTopics(location);
          source = "google-news-fallback";
        } catch (fallbackError) {
          throw providerError("Live Signal is temporarily unavailable for this location. Please try again shortly.", "live_signal_unavailable");
        }
      }
    } else {
      source = "google-news";
      topics = await fetchNewsTopics(location);
    }

    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return json(res, 200, { location, source, updatedAt: new Date().toISOString(), topics });
  } catch (error) {
    console.error("[live-signal] request failed", { code: error?.code || "unknown", status: error?.status || 503, message: error?.message || "unknown" });
    return json(res, Number(error?.status) || 503, { code: error?.code || "live_signal_unavailable", message: error?.message || "Live Signal is temporarily unavailable. Please try again shortly." });
  }
}
