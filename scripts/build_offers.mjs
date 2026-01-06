import fs from "fs";
import path from "path";

const API_URL = "PASTE_THE_REAL_API_URL_HERE";

async function main() {
  const res = await fetch(API_URL, {
    headers: {
      "user-agent": "Mozilla/5.0"
    }
  });

  const json = await res.json();

  // 👇 adjust this based on actual response shape
  const offers = json.data.map(o => ({
    title: o.title || o.name,
    brand: o.brand?.name || o.partner,
    category: o.category?.name,
    image: o.bannerImage,
    url: "https://www.timesprime.com" + o.slug
  }));

  const out = {
    updatedAt: new Date().toISOString(),
    offers
  };

  fs.writeFileSync(
    path.join(process.cwd(), "data", "offers.json"),
    JSON.stringify(out, null, 2)
  );

  console.log(`✅ Saved ${offers.length} offers`);
}

main();
