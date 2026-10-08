// Build-time static sitemap for the landing site.
//
// Reads dist/sitemap-routes.json (from generate-sitemap-routes.mjs) and writes
// dist/sitemap-site.xml. The BFF's /sitemap.xml sitemapindex points at this file.
import { existsSync, readFileSync, writeFileSync } from "fs";

const SITE_URL = "https://saigon-rider.com";
const INPUT = "dist/sitemap-routes.json";
const OUTPUT = "dist/sitemap-site.xml";
// /vi redirects to /, /auth is a login page, /apply* is business-host only (and payment returns).
const isExcluded = (route) => route === "/vi" || route === "/auth" || route.startsWith("/apply");

if (!existsSync(INPUT)) {
  console.error(`[sitemap-site] ${INPUT} not found; run generate-sitemap-routes.mjs first`);
  process.exit(1);
}

const { routes } = JSON.parse(readFileSync(INPUT, "utf8"));
const locs = routes.filter((route) => !isExcluded(route)).map((route) => `${SITE_URL}${route}`);
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...locs.map((loc) => `  <url><loc>${loc}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

writeFileSync(OUTPUT, xml);
console.log(`[sitemap-site] wrote ${locs.length} urls to ${OUTPUT}`);
