/**
 * scripts/update_offers.mjs
 * Scrapes Times Prime category listing pages and updates data/offers.json
 *
 * Run: node scripts/update_offers.mjs
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const OUTPUT_PATH = path.join(process.cwd(), "data", "offers.json");

// Times Prime pages to discover categories from
const CATEGORIES_INDEX_URL = "https://www.timesprime.com/categories";

// Offer link detection rule
const isOfferLink = (href) =>
  typeof href === "string" &&
  href.startsWith("/categories/") &&
  !href.includes("/blog/") &&
  !href.includes("#") &&
  !href.includes("javascript:");

// Normalize URL
const absUrl = (href) => {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `https://www.timesprime.com${href}`;
};

function safeText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

async function autoExpandListings(page) {
  // Try clicking different possible "Load More" button variants
  const loadMoreSelectors = [
    "button:has-text('Load More')",
    "button:has-text('Load More Offers')",
    "button:has-text('Load More Articles')",
    "div:has-text('Load More')",
    ".ThemeThreePagination button",
    ".ThemeThreePagination .lodemorecontent button",
  ];

  let lastCount = 0;

  for (let i = 0; i < 60; i++) {
    // Scroll down to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);

    // Try clicking a visible load more
    let clicked = false;
    for (const sel of loadMoreSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count()) {
        try {
          if (await btn.isVisible()) {
            await btn.click({ timeout: 2000 });
            clicked = true;
            await page.waitForTimeout(1200);
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    // Check if new offers appeared (based on number of offer links)
    const currentCount = await page.locator("a[href^='/categories/']").count();

    // If no growth and we didn’t click anything meaningful, stop
    if (currentCount <= lastCount && !clicked) break;
    lastCount = currentCount;
  }
}

async function getAllCategoryLinks(page) {
  await page.goto(CATEGORIES_INDEX_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Grab category links from the categories page
  const links = await page.$$eval("a[href^='/categories/']", (as) =>
    Array.from(as)
      .map((a) => a.getAttribute("href"))
      .filter(Boolean)
  );

  // Category links look like: /categories/Travel/flipkart-flight-offer (offers)
  // and also /categories/Travel (category listing)
  // We'll keep only category listing pages here: /categories/<CategoryName>
  const categoryListingLinks = new Set();

  for (const href of links) {
    const parts = href.split("/").filter(Boolean); // ["categories","Travel",...]
    if (parts[0] !== "categories") continue;

    // Listing page format usually: /categories/<CategoryName>
    // Offer page format: /categories/<CategoryName>/<slug>
    if (parts.length === 2) {
      categoryListingLinks.add(href);
    }
  }

  // Fallback: if site doesn’t expose clean listing links, you can hardcode known categories here.
  if (categoryListingLinks.size === 0) {
    console.warn(
      "⚠️ Could not discover category listing pages from /categories. Falling back to common categories."
    );
    [
      "/categories/Travel",
      "/categories/Food",
      "/categories/Entertainment",
      "/categories/Shopping",
      "/categories/Health",
      "/categories/Learning",
      "/categories/Finance",
      "/categories/Lifestyle",
    ].forEach((c) => categoryListingLinks.add(c));
  }

  return Array.from(categoryListingLinks).map(absUrl);
}

async function scrapeCategoryOffers(page, categoryUrl) {
  await page.goto(categoryUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Expand the listing (scroll + load more)
  await autoExpandListings(page);

  // Derive category name from URL
  const category = safeText(new URL(categoryUrl).pathname.split("/")[2] || "");

  // Extract offer cards:
  // We'll extract from anchor tags that look like offer pages: /categories/<Category>/<slug>
  const offers = await page.$$eval("a[href^='/categories/']", (anchors) => {
    const out = [];
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      // Offer pages usually have 3 segments: /categories/<Category>/<slug>
      const parts = href.split("/").filter(Boolean);
      if (parts[0] !== "categories" || parts.length < 3) continue;

      // Try title from anchor text or nested heading
      const title =
        (a.querySelector("h1,h2,h3,h4")?.textContent ||
          a.textContent ||
          "")?.trim();

      // Try image from nested img
      const img =
        a.querySelector("img")?.getAttribute("src") ||
        a.querySelector("img")?.getAttribute("data-src") ||
        a.querySelector("img")?.getAttribute("data-lazy-src") ||
        "";

      // Try brand text from common patterns within card
      const brand =
        (a.querySelector("[data-brand]")?.getAttribute("data-brand") ||
          a.querySelector(".brand, .Brand, .offer-brand")?.textContent ||
          "")?.trim();

      out.push({
        href,
        title,
        image: img,
        brand,
      });
    }
    return out;
  });

  // Clean + normalize
  const cleaned = offers
    .map((o) => ({
      title: safeText(o.title),
      url: absUrl(o.href),
      category,
      image: (o.image || "").startsWith("http")
        ? o.image
        : o.image
        ? absUrl(o.image)
        : "",
      brand: safeText(o.brand),
    }))
    .filter((o) => o.url && o.title);

  return cleaned;
}

async function enrichMissingFields(page, offer) {
  // If image or brand is missing, open offer page and read og tags as fallback
  if (offer.image && offer.brand) return offer;

  try {
    await page.goto(offer.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    const meta = await page.evaluate(() => {
      const ogTitle = document
        .querySelector("meta[property='og:title']")
        ?.getAttribute("content");
      const ogImage = document
        .querySelector("meta[property='og:image']")
        ?.getAttribute("content");
      const titleTag = document.querySelector("title")?.textContent;

      // Try to find a brand-ish label on page (best effort)
      const brandText =
        document.querySelector("[data-brand]")?.getAttribute("data-brand") ||
        document
          .querySelector(".brand, .Brand, .offer-brand")
          ?.textContent ||
        "";

      return {
        ogTitle: ogTitle || "",
        ogImage: ogImage || "",
        titleTag: titleTag || "",
        brandText: brandText || "",
      };
    });

    return {
      ...offer,
      title: offer.title || safeText(meta.ogTitle || meta.titleTag),
      image: offer.image || safeText(meta.ogImage),
      brand: offer.brand || safeText(meta.brandText),
    };
  } catch {
    return offer;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
  });

  const page = await ctx.newPage();

  console.log("🔎 Discovering category listing pages...");
  const categoryUrls = await getAllCategoryLinks(page);
  console.log(`✅ Found ${categoryUrls.length} category pages`);

  const all = [];
  for (const url of categoryUrls) {
    console.log(`\n📂 Scraping category: ${url}`);
    try {
      const offers = await scrapeCategoryOffers(page, url);
      console.log(`   → Found ${offers.length} offers`);
      all.push(...offers);
    } catch (e) {
      console.warn(`   ⚠️ Failed category ${url}:`, e?.message || e);
    }
  }

  // Deduplicate by URL
  const byUrl = new Map();
  for (const o of all) {
    if (!o.url) continue;
    if (!byUrl.has(o.url)) byUrl.set(o.url, o);
  }

  let offers = Array.from(byUrl.values());

  // Optional: enrich missing image/brand using offer page
  // (This opens many pages; keep it limited)
  console.log(`\n🧩 Enriching missing fields (best effort)...`);
  const enrichPage = await ctx.newPage();
  let enriched = 0;

  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    if (!o.image || !o.brand || !o.title) {
      offers[i] = await enrichMissingFields(enrichPage, o);
      enriched++;
      if (enriched % 20 === 0) console.log(`   … enriched ${enriched}`);
    }
  }

  // Sort for stable output
  offers.sort((a, b) => (a.category || "").localeCompare(b.category || ""));

  const payload = {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: offers.length,
    offers,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");

  console.log(`\n✅ Saved ${offers.length} offers → ${OUTPUT_PATH}`);

  await browser.close();
}

main().catch((err) => {
  console.error("❌ Scrape failed:", err);
  process.exit(1);
});
