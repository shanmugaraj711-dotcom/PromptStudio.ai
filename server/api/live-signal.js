import { requireUser, json } from "./_firebaseAdmin.js";

const GEO_CODES = {
  "tamil nadu": "IN-TN",
  "tamilnadu": "IN-TN",
  "chennai": "IN-TN",
  "coimbatore": "IN-TN",
  "madurai": "IN-TN",
  "tiruchirappalli": "IN-TN",
  "salem": "IN-TN",
  "kerala": "IN-KL",
  "karnataka": "IN-KA",
  "andhra pradesh": "IN-AP",
  "telangana": "IN-TG",
  "maharashtra": "IN-MH",
  "delhi": "IN-DL",
  "india": "IN",
};

const clean = (value, max = 80) => String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
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
    const link = read("link");
    return { rank: index + 1, title, traffic: "Live topic", description: `${location} coverage`, url: link };
  }).filter((item) => item.title);
};

const withTimeout = async (url, ms = 6500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { signal: controller.signal, headers: { "User-Agent": "PromptStudioAI/1.0 LiveSignal" } }); }
  finally { clearTimeout(timer); }
};

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { message: "Use GET for Live Signal." });
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
      } catch {}
    }

    const geoCode = GEO_CODES[location.toLowerCase()] || GEO_CODES[location.toLowerCase().replace(/\s+/g, " ")];
    let topics = [];
    let source = "google-trends";

    if (geoCode) {
      const response = await withTimeout(`https://trends.google.com/trends/api/dailytrends?hl=en-IN&tz=-330&geo=${encodeURIComponent(geoCode)}&ns=15`);
      if (!response.ok) throw new Error("The live trend provider returned an error.");
      topics = decodeTrends(await response.text());
    } else {
      source = "google-news";
      const query = encodeURIComponent(`${location} when:1d`);
      const response = await withTimeout(`https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`);
      if (!response.ok) throw new Error("The live topic provider returned an error.");
      topics = decodeNews(await response.text(), location);
    }

    if (!topics.length) throw new Error("No live topics are available for this location right now.");
    res.setHeader("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return json(res, 200, { location, source, updatedAt: new Date().toISOString(), topics });
  } catch (error) {
    console.error("[live-signal]", error?.message || error);
    return json(res, Number(error?.status) || 503, { message: error?.message || "Live Signal is temporarily unavailable." });
  }
}
