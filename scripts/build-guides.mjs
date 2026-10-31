// Builds static guide pages, guides index, sitemap.xml and robots.txt into public/.
// Run: node scripts/build-guides.mjs   (also runs as part of `npm run build`)
import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, EXTRA, SITE, CHECKED, CHECKED_ISO } from '../guides/content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const out = join(pub, 'guides');
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'guides', 'guides.css'), join(out, 'guides.css'));
copyFileSync(join(root, 'guides', 'guides.js'), join(out, 'guides.js'));
mkdirSync(join(out, 'fonts'), { recursive: true });
for (const w of [400, 600, 800]) copyFileSync(join(root, 'guides', 'fonts', `manrope-latin-${w}-normal.woff2`), join(out, 'fonts', `manrope-latin-${w}-normal.woff2`));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const link = (html) => html.replace(/\{\{g:([a-z0-9-]+)\}\}/g, (_, slug) => {
  if (!PAGES.some((p) => p.slug === slug)) throw new Error(`Unknown guide link: ${slug}`);
  return `/guides/${slug}/`;
});
const mins = (p) => Math.max(1, Math.round(strip([p.answer, ...p.sections.map((s) => s[1])].join(' ')).split(' ').length / 200));

const head = (title, desc, path, extra = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="preload" href="/guides/fonts/manrope-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/guides/guides.css">
<script src="/guides/guides.js" defer></script>
<meta property="og:type" content="article"><meta property="og:site_name" content="NRI FinWealth">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE}/og.png">
${extra}</head><body>`;

const header = `<div id="bar"></div><header class="top"><a class="logo" href="/">NRI FinWealth</a><nav><a href="/guides/">Guides</a><a class="pill" href="/">Open the planner</a></nav></header>`;
const footer = `<footer><div class="in">
<div><h4>Guides</h4>${PAGES.slice(0, 4).map((p) => `<a href="/guides/${p.slug}/">${esc(p.short)}</a>`).join('')}</div>
<div><h4>More guides</h4>${PAGES.slice(4).map((p) => `<a href="/guides/${p.slug}/">${esc(p.short)}</a>`).join('')}</div>
<div><h4>NRI FinWealth</h4><p>Free and open source. General information, not financial, tax or legal advice. The planner runs in your browser; your numbers are not sent anywhere.</p><a href="/">Open the planner</a></div>
</div></footer></body></html>`;

for (const p of PAGES) {
  const path = `/guides/${p.slug}/`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.description, dateModified: CHECKED_ISO, datePublished: CHECKED_ISO, mainEntityOfPage: SITE + path, publisher: { '@type': 'Organization', name: 'NRI FinWealth', url: SITE } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: SITE + '/guides/' },
      { '@type': 'ListItem', position: 3, name: p.short, item: SITE + path } ] },
  ].map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  const x = EXTRA[p.slug];
  if (!x) throw new Error('Missing EXTRA for ' + p.slug);
  const ids = p.sections.map((_, i) => `s${i + 1}`);
  const nexts = p.related.slice(0, 2).map((r) => PAGES.find((q) => q.slug === r));
  const banner = (cls) => `<div class="mid ${cls}"><div><b>${esc(x.cta[0])}</b><span>${esc(x.cta[1])}</span></div><a class="btn" href="/">Open the planner &rarr;</a></div>`;
  const body = `${header}
<div class="hero"><div class="kicker">${esc(x.kicker)}</div>
<h1>${esc(p.title)}</h1>
<div class="meta"><span><b>${mins(p)} min read</b></span><span>Last checked ${CHECKED}</span><span>Sources listed at the end</span></div></div>
<div class="wrap">
<nav class="toc"><h4>In this guide</h4>${p.sections.map(([h], i) => `<a href="#${ids[i]}">${esc(h)}</a>`).join('')}<a href="#faq">Frequently asked</a><a href="#sources">Sources</a></nav>
<main>
<div class="crumb"><a href="/">Home</a> &rsaquo; <a href="/guides/">Guides</a> &rsaquo; ${esc(p.short)}</div>
<div class="take"><h3>The short version</h3><ul>${x.take.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
<p class="answer">${link(p.answer)}</p>
${p.sections.map(([h, html], i) => `<h2 id="${ids[i]}">${esc(h)}</h2>\n${link(html)}${i === 0 ? '\n' + banner('dark') : ''}`).join('\n')}
<div class="warn"><b>${esc(p.check[0])}.</b> ${link(p.check[1])}</div>
<h2 id="faq">Frequently asked</h2>
${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
<h2 id="sources">Sources</h2>
<ol class="src">${p.sources.map(([t, u]) => `<li><a href="${u}" rel="noopener">${esc(t)}</a> (checked ${CHECKED})</li>`).join('')}</ol>
<div class="warn"><b>Not advice.</b> General information for planning, as of ${CHECKED}. Rules change and your case may differ. Check with a qualified adviser before you act.</div>
<div class="next">${nexts.map((n) => `<a href="/guides/${n.slug}/"><small>Read next</small><b>${esc(n.title)}</b></a>`).join('')}</div>
${banner('green')}
</main>
<aside class="side"><div class="card"><h3>Does your money last?</h3><p>Test the Netherlands, India or both with your own numbers.</p><ul><li>Free, no sign-up</li><li>Stays in your browser</li></ul><a class="btn" href="/">Open the planner</a></div></aside>
</div>
<div class="sticky"><span>Test this with your numbers</span><a href="/">Open planner</a></div>
${footer}`;
  mkdirSync(join(out, p.slug), { recursive: true });
  writeFileSync(join(out, p.slug, 'index.html'), head(`${p.title} | NRI FinWealth`, p.description, path, ld) + body);
}

// Guides index
const idx = `${header}<div class="hero"><div class="kicker">NRI FinWealth guides</div><h1>Guides for NRIs planning retirement from the Netherlands</h1></div><div class="wrap one"><main>
<div class="crumb"><a href="/">Home</a> &rsaquo; Guides</div>
<p class="lead">Plain-language explanations with sources. Each guide shows when it was last checked. General information, not advice.</p>
<ul class="cards">${PAGES.map((p) => `<li><a href="/guides/${p.slug}/"><small>${esc(EXTRA[p.slug].kicker)}</small><b>${esc(p.title)}</b><span>${esc(p.description)}</span></a></li>`).join('')}</ul>
<a class="btn solid" href="/">Open the planner</a>
</main></div><div class="sticky"><span>Test this with your numbers</span><a href="/">Open planner</a></div>${footer}`;
writeFileSync(join(out, 'index.html'), head('Guides for NRIs in the Netherlands | NRI FinWealth', 'Plain-language guides on Dutch pensions, Box 3, Indian tax status, inheritance and gifts for NRIs planning retirement.', '/guides/') + idx);

// sitemap + robots
const urls = ['/', '/guides/', ...PAGES.map((p) => `/guides/${p.slug}/`)];
writeFileSync(join(pub, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${CHECKED_ISO}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(pub, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${PAGES.length} guides, index, sitemap.xml, robots.txt`);
