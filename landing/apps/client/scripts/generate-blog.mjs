// Build-time static blog generator (light track, D12 of 261010_fm_google_blog_exposure_task.md).
//
// Source : content/blog/<lang>/<slug>.md  (lang = vi | ko)
// Output : dist/blog/<slug>/index.html, dist/ko/blog/<slug>/index.html,
//          hubs dist/blog/index.html, dist/ko/blog/index.html, dist/blog-routes.json
//          (generate-sitemap-site.mjs appends blog-routes.json to the sitemap).
//
// Publish gate: only files with `status: ready` AND a non-empty `reviewed_on` are emitted.
// Files starting with "_" and non-.md files are ignored. A violation in an emitted file exits 1.
// Nothing publishable => nothing is written (no dist/blog, no blog-routes.json).
//
// Front matter: `---` block, `key: value` lines; lists as `[a, b]` (items may be "…" or '…' quoted to contain commas)
//   or `- item` lines under the key. An empty value is "" unless `- item` lines follow.
//   required: topic_id, slug, lang, title, description, date_published, reviewed_on
//   optional: date_modified (default date_published), tags, status, reviewed_by (never rendered), sources
//   sources items: URL or "text | URL"
//
// Markdown subset (all text is HTML-escaped first; raw HTML is not supported):
//   ## / ### headings (a body `#` h1 is an error), paragraphs, `-`/`*` unordered and `1.` ordered
//   lists (single level; `<ol start>` follows the first item number), `> ` blockquote,
//   `---` horizontal rule, **bold**, *em*, `code`,
//   [text](url) links (http(s) or site-relative "/..." only; no backslash; one level of
//   balanced parentheses allowed in the URL; emphasis markers inside a URL are not touched).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const SITE_URL = "https://saigon-rider.com";
const CONTENT_DIR = "content/blog";
const DIST = "dist";
const LANGS = ["vi", "ko"];
const LOGO_URL = `${SITE_URL}/apple-touch-icon.png`;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LABELS = {
  vi: { blog: "Blog Saigon Rider", hubDesc: "Bài viết của Saigon Rider dành cho tài xế và người dân Sài Gòn.", home: "Trang chủ", published: "Đăng ngày", updated: "Cập nhật", sources: "Nguồn tham khảo" },
  ko: { blog: "사이공라이더 블로그", hubDesc: "사이공라이더가 전하는 사이공 생활 이야기.", home: "홈", published: "발행", updated: "수정", sources: "참고 자료" },
  en: { blog: "Saigon Rider Blog", hubDesc: "Articles from Saigon Rider.", home: "Home", published: "Published", updated: "Updated", sources: "Sources" },
};
const LOCALE = { vi: "vi_VN", ko: "ko_KR", en: "en_US" };
const prefix = (lang) => (lang === "ko" ? "/ko" : "");
const hubPath = (lang) => `${prefix(lang)}/blog/`;
const articlePath = (lang, slug) => `${prefix(lang)}/blog/${slug}/`;
const homePath = (lang) => (lang === "ko" ? "/ko" : "/");
const abs = (path) => `${SITE_URL}${path}`;

const fail = (msg) => {
  console.error(`[blog] ERROR: ${msg}`);
  process.exit(1);
};

// ---------- front matter ----------
const stripQuotes = (v) => v.replace(/^(["'])(.*)\1$/, "$2");

// split on commas outside "…" / '…' quotes
function splitList(str) {
  const items = [];
  let cur = "";
  let q = null;
  for (const ch of str) {
    if (q) {
      if (ch === q) q = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ",") {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  items.push(cur);
  return items.map((x) => stripQuotes(x.trim())).filter(Boolean);
}

function parseFrontMatter(text, file) {
  const m = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/);
  if (!m) return null;
  const meta = {};
  let listKey = null;
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      if (!Array.isArray(meta[listKey])) meta[listKey] = [];
      meta[listKey].push(stripQuotes(item[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (!kv) fail(`${file}: cannot parse front matter line "${line}"`);
    const [, key, raw] = kv;
    const val = raw.trim();
    if (val === "") {
      meta[key] = "";
      listKey = key;
    } else if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = splitList(val.slice(1, -1));
      listKey = null;
    } else {
      meta[key] = stripQuotes(val);
      listKey = null;
    }
  }
  return { meta, body: m[2] ?? "" };
}

const validDate = (s) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// ---------- markdown subset ----------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(raw) {
  const codes = [];
  const urls = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  // links become placeholders so emphasis never touches the URL; url is already escaped
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (all, text, url) => {
    const ok = !/[\\\u0000]/.test(url) && (/^https?:\/\//.test(url) || (url.startsWith("/") && !url.startsWith("//")));
    return ok ? `\u0001${urls.push(url) - 1}\u0001${text}\u0002` : all;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>");
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<a href="${urls[i]}">`).replace(/\u0002/g, "</a>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function markdownToHtml(body, file) {
  const out = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  const isBlock = (l) => /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s?|---\s*$)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      const level = m[1].length;
      if (level === 1) fail(`${file}: body must not contain a "#" h1 (title comes from front matter)`);
      if (level > 3) fail(`${file}: only ## and ### headings are supported`);
      out.push(`<h${level}>${inline(m[2].trim())}</h${level}>`);
      i++;
    } else if (/^---\s*$/.test(line)) {
      out.push("<hr>");
      i++;
    } else if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const re = ordered ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/;
      const first = ordered ? Number(line.match(/^(\d+)\./)[1]) : 1;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(`<li>${inline(lines[i++].match(re)[1].trim())}</li>`);
      out.push(`<${ordered ? "ol" : "ul"}${ordered && first !== 1 ? ` start="${first}"` : ""}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
    } else if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, "").trim());
      out.push(`<blockquote><p>${inline(q.join(" "))}</p></blockquote>`);
    } else {
      const p = [];
      while (i < lines.length && lines[i].trim() && !isBlock(lines[i])) p.push(lines[i++].trim());
      out.push(`<p>${inline(p.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

// ---------- load + validate ----------
function loadArticles() {
  const articles = [];
  for (const lang of LANGS) {
    const dir = join(CONTENT_DIR, lang);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith("_") || !name.endsWith(".md")) continue;
      const file = join(dir, name);
      const parsed = parseFrontMatter(readFileSync(file, "utf8"), file);
      if (!parsed) continue; // no front matter => not publishable
      const { meta, body } = parsed;
      if (meta.status !== "ready" || !String(meta.reviewed_on ?? "").trim()) continue;

      for (const k of ["topic_id", "slug", "lang", "title", "description", "date_published", "date_modified", "status", "reviewed_on", "reviewed_by"]) {
        if (meta[k] !== undefined && typeof meta[k] !== "string") fail(`${file}: "${k}" must be a single value, not a list`);
      }
      for (const k of ["topic_id", "slug", "lang", "title", "description", "date_published", "reviewed_on"]) {
        if (!String(meta[k] ?? "").trim()) fail(`${file}: missing required field "${k}"`);
      }
      const slug = name.slice(0, -3);
      if (meta.slug !== slug) fail(`${file}: slug "${meta.slug}" does not match filename "${slug}"`);
      if (!SLUG_RE.test(slug)) fail(`${file}: slug "${slug}" must match ${SLUG_RE}`);
      if (meta.lang !== lang) fail(`${file}: lang "${meta.lang}" does not match folder "${lang}"`);
      meta.date_modified = meta.date_modified || meta.date_published;
      for (const k of ["date_published", "date_modified", "reviewed_on"]) {
        if (!validDate(meta[k])) fail(`${file}: ${k} "${meta[k]}" is not a valid YYYY-MM-DD date`);
      }
      articles.push({
        lang, slug, topicId: meta.topic_id, title: meta.title, description: meta.description,
        datePublished: meta.date_published, dateModified: meta.date_modified,
        tags: asList(meta.tags), sources: asList(meta.sources), html: markdownToHtml(body, file), file,
      });
    }
  }
  const seenSlug = new Set();
  const seenTopic = new Set();
  for (const a of articles) {
    if (seenSlug.has(`${a.lang}/${a.slug}`)) fail(`duplicate slug ${a.lang}/${a.slug}`);
    seenSlug.add(`${a.lang}/${a.slug}`);
    if (seenTopic.has(`${a.lang}/${a.topicId}`)) fail(`${a.file}: more than one ${a.lang} article for topic_id "${a.topicId}"`);
    seenTopic.add(`${a.lang}/${a.topicId}`);
  }
  return articles;
}

// ---------- page rendering ----------
const STYLE = `body{margin:0;font:16px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#fff}
a{color:#0b5cad}header,main,footer{max-width:720px;margin:0 auto;padding:12px 16px}
header{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e5e5}
header a:first-child{font-weight:700;text-decoration:none;color:inherit}
nav.crumbs{font-size:14px;color:#555}h1{font-size:1.75rem;line-height:1.3}h2{margin-top:2rem}
.meta{color:#555;font-size:14px}blockquote{margin:1rem 0;padding:0 1rem;border-left:4px solid #ddd;color:#444}
code{background:#f3f3f3;padding:0 4px;border-radius:3px}ul.posts{list-style:none;padding:0}ul.posts li{margin:0 0 1.5rem}
ul.posts a{font-weight:600;font-size:1.1rem}`;

const jsonLd = (graph) =>
  `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;

function head({ lang, title, description, path, type, alternates }) {
  const url = abs(path);
  const alt = alternates
    ? [...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(alternates[l])}">`), `<link rel="alternate" hreflang="x-default" href="${abs(alternates.vi)}">`]
    : [];
  return [
    "<!doctype html>", `<html lang="${lang}">`, "<head>", '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)} | Saigon Rider</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`, ...alt,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`, `<meta property="og:type" content="${type}">`,
    `<meta property="og:locale" content="${LOCALE[lang]}">`,
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    `<style>${STYLE}</style>`,
  ];
}

const siteHeader = (lang) =>
  `<header><a href="${homePath(lang)}">Saigon Rider</a><a href="${hubPath(lang)}">${esc(LABELS[lang].blog)}</a></header>`;

const org = { "@type": "Organization", name: "Saigon Rider", url: `${SITE_URL}/` };

function crumbs(lang, trail) {
  const L = LABELS[lang];
  const items = [[L.home, homePath(lang)], [L.blog, hubPath(lang)], ...(trail ? [trail] : [])];
  const html = `<nav class="crumbs" aria-label="breadcrumb">${items.map(([n, p], i) => (i === items.length - 1 && trail ? esc(n) : `<a href="${p}">${esc(n)}</a>`)).join(" › ")}</nav>`;
  const ld = {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(p) })),
  };
  return { html, ld };
}

function renderArticle(a, alternates) {
  const L = LABELS[a.lang];
  const path = articlePath(a.lang, a.slug);
  const bc = crumbs(a.lang, [a.title, path]);
  const srcs = a.sources.map((s) => {
    const [text, url] = s.includes("|") ? s.split("|").map((x) => x.trim()) : [s, s];
    return /^https?:\/\//.test(url) ? `<li><a href="${esc(url)}" rel="noopener">${esc(text)}</a></li>` : `<li>${esc(s)}</li>`;
  });
  const article = {
    "@type": "Article", headline: a.title, description: a.description, inLanguage: a.lang,
    datePublished: a.datePublished, dateModified: a.dateModified, author: org,
    publisher: { ...org, logo: { "@type": "ImageObject", url: LOGO_URL } },
    mainEntityOfPage: abs(path), ...(a.tags.length ? { keywords: a.tags.join(", ") } : {}),
  };
  return [
    ...head({ lang: a.lang, title: a.title, description: a.description, path, type: "article", alternates }),
    jsonLd([article, bc.ld]), "</head>", "<body>", siteHeader(a.lang), "<main>", bc.html, "<article>",
    `<h1>${esc(a.title)}</h1>`,
    `<p class="meta">${L.published}: <time datetime="${a.datePublished}">${a.datePublished}</time> · ${L.updated}: <time datetime="${a.dateModified}">${a.dateModified}</time></p>`,
    a.html,
    ...(srcs.length ? [`<section><h2>${L.sources}</h2><ul>${srcs.join("")}</ul></section>`] : []),
    "</article>", "</main>", "</body>", "</html>", "",
  ].join("\n");
}

function renderHub(lang, list, alternates) {
  const L = LABELS[lang];
  const path = hubPath(lang);
  const bc = crumbs(lang, null);
  const graph = [
    { "@type": "CollectionPage", name: L.blog, description: L.hubDesc, inLanguage: lang, url: abs(path) },
    {
      "@type": "ItemList",
      itemListElement: list.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(articlePath(lang, a.slug)), name: a.title })),
    },
    bc.ld,
  ];
  return [
    ...head({ lang, title: L.blog, description: L.hubDesc, path, type: "website", alternates }),
    jsonLd(graph), "</head>", "<body>", siteHeader(lang), "<main>", bc.html,
    `<h1>${esc(L.blog)}</h1>`, `<p>${esc(L.hubDesc)}</p>`, '<ul class="posts">',
    ...list.map((a) => `<li><a href="${articlePath(lang, a.slug)}">${esc(a.title)}</a><div class="meta"><time datetime="${a.datePublished}">${a.datePublished}</time></div><p>${esc(a.description)}</p></li>`),
    "</ul>", "</main>", "</body>", "</html>", "",
  ].join("\n");
}

// ---------- main ----------
const write = (path, content) => {
  const target = join(DIST, path.replace(/\/$/, ""), "index.html");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};

const articles = loadArticles();
if (articles.length === 0) {
  console.log("[blog] no publishable articles — nothing written");
  process.exit(0);
}

const routes = [];
const byLang = Object.fromEntries(LANGS.map((l) => [l, articles.filter((a) => a.lang === l).sort((x, y) => y.datePublished.localeCompare(x.datePublished) || x.slug.localeCompare(y.slug))]));
const byTopic = new Map();
for (const a of articles) byTopic.set(`${a.topicId}/${a.lang}`, a);

for (const a of articles) {
  const pair = LANGS.map((l) => byTopic.get(`${a.topicId}/${l}`));
  const alternates = pair.every(Boolean) ? Object.fromEntries(pair.map((p) => [p.lang, articlePath(p.lang, p.slug)])) : null;
  write(articlePath(a.lang, a.slug), renderArticle(a, alternates));
  routes.push({ path: articlePath(a.lang, a.slug), lastmod: a.dateModified });
}

const hubLangs = LANGS.filter((l) => byLang[l].length > 0);
const hubAlternates = hubLangs.length === LANGS.length ? Object.fromEntries(LANGS.map((l) => [l, hubPath(l)])) : null;
for (const l of hubLangs) {
  write(hubPath(l), renderHub(l, byLang[l], hubAlternates));
  routes.push({ path: hubPath(l), lastmod: byLang[l].map((a) => a.dateModified).sort().pop() });
}

writeFileSync(join(DIST, "blog-routes.json"), `${JSON.stringify({ routes }, null, 2)}\n`);
console.log(`[blog] wrote ${articles.length} articles, ${hubLangs.length} hubs`);
