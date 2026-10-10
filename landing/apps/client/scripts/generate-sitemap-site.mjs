// Build-time static sitemap for the landing site.
//
// Reads dist/sitemap-routes.json (from generate-sitemap-routes.mjs) and writes
// dist/sitemap-site.xml. The BFF's /sitemap.xml sitemapindex points at this file.
import { existsSync, readFileSync, writeFileSync } from "fs";

const SITE_URL = "https://saigon-rider.com";
const INPUT = "dist/sitemap-routes.json";
const BLOG_INPUT = "dist/blog-routes.json";
const OUTPUT = "dist/sitemap-site.xml";
// /vi redirects to /, /auth is a login page, /apply* is business-host only (and payment returns).
// DUPLICATE_ROUTES render the same component as home (duplicate content).
const DUPLICATE_ROUTES = new Set([
  "/product", "/security", "/solutions", "/how-it-works", "/pricing", "/resources", "/contact",
]);
const isExcluded = (route) =>
  route === "/vi" || route === "/auth" || route.startsWith("/apply") || DUPLICATE_ROUTES.has(route);

if (!existsSync(INPUT)) {
  console.error(`[sitemap-site] ${INPUT} not found; run generate-sitemap-routes.mjs first`);
  process.exit(1);
}

const { routes } = JSON.parse(readFileSync(INPUT, "utf8"));
const locs = routes.filter((route) => !isExcluded(route)).map((route) => `${SITE_URL}${route}`);
// Blog routes (generate-blog.mjs) carry lastmod; absent file => nothing appended.
const blogRoutes = existsSync(BLOG_INPUT) ? JSON.parse(readFileSync(BLOG_INPUT, "utf8")).routes : [];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...locs.map((loc) => `  <url><loc>${loc}</loc></url>`),
  ...blogRoutes.map(({ path, lastmod }) => `  <url><loc>${SITE_URL}${path}</loc><lastmod>${lastmod}</lastmod></url>`),
  "</urlset>",
  "",
].join("\n");

writeFileSync(OUTPUT, xml);
console.log(`[sitemap-site] wrote ${locs.length + blogRoutes.length} urls to ${OUTPUT}`);
