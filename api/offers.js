import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "offers.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");

    res.status(200).json({
      ok: true,
      updatedAt: json.updatedAt || null,
      count: Array.isArray(json.offers) ? json.offers.length : 0,
      offers: json.offers || []
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
