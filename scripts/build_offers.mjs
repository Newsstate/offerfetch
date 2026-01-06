import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const BASE = "https://www.timesprime.com";

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (OffersBot)"
    }
  });
  return res.text();
}

async function getAllOfferUrls() {
  const html = await fetchHTML(`${BASE}/categories`);
  const $ = cheerio.load(html);

  const urls = new Set();

  // capture offer links
  $('a[href^="/categories/"]').each((_, a) => {
    const href = $(a).attr("href");
    if (href && href.includes("-offer")) {
      urls.add(BASE + href);
    }
  });

  return [...urls];
}

async function parseOfferPage(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    "";

  const image =
    $('meta[property="og:image"]').attr("content") ||
    "";

  const brand =
    $('img[src*="logo"]').first().attr("alt") ||
    title.split(" ")[0];

  const category =
    url.split("/categories/")[1]?.split("/")[0] || "";

  return {
    title,
    url,
    category,
    image,
    brand
  };
}

async function main() {
  const urls = await getAllOfferUrls();
  console.log(`Found ${urls.length} offer URLs`);

  const offers = [];

  for (const url of urls) {
    try {
      const offer = await parseOfferPage(url);
      if (offer.title) offers.push(offer);
    } catch (e) {
      console.error("Failed:", url);
    }
  }

  const out = {
    updatedAt: new Date().toISOString(),
    offers
  };

  const outPath = path.join(process.cwd(), "data", "offers.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Saved ${offers.length} offers`);
}

main();
