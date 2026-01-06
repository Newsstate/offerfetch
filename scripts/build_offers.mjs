import fs from "fs";
import path from "path";

async function main() {
  // Replace this logic with real scraping logic
  const offers = [
    {
      title: "Up to ₹2400 Off on flight bookings",
      url: "https://www.timesprime.com/categories/Travel/flipkart-flight-offer",
      category: "Travel",
      image: "",
      brand: "Flipkart Flights"
    }
  ];

  const out = {
    updatedAt: new Date().toISOString(),
    offers
  };

  const outPath = path.join(process.cwd(), "data", "offers.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${offers.length} offers to data/offers.json`);
}

main();
