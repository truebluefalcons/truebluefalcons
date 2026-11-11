#!/usr/bin/env node
// Search-engine pass over the assembled site (run by the deploy workflow after "Assemble site").
//
//   node scripts/seo.mjs _site
//
// The stats page is drawn by JavaScript, so a crawler that reads the raw HTML sees almost no
// text. This writes a plain-HTML season summary (record, top run scorers, top wicket takers,
// results) into the <!--SEO:SUMMARY--> slot of index.html, and writes sitemap.xml and
// robots.txt with the site's address taken from the CNAME file.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../assets/js/stats.js'; // sets globalThis.TBFStats

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ? resolve(process.argv[2]) : ROOT;
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const host = existsSync(join(ROOT, 'CNAME')) ? readFileSync(join(ROOT, 'CNAME'), 'utf8').trim() : 'truebluefalcons.github.io';
const SITE = `https://${host}/`;

export function summaryHtml(config, players, season) {
  const S = globalThis.TBFStats;
  const agg = S.aggregate(season, players, 'all');
  const lines = [...agg.lines.values()].filter((x) => x.matches > 0);
  const name = (p) => p.first + ' ' + p.last;
  const tName = (id) => (config.tournaments.find((t) => t.id === id) || { name: id }).name;
  const matches = [...(season.matches || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!matches.length) return `<p>No ${esc(config.season)} matches have been played yet.</p>`;

  const ours = (r) => config.teamAliases.some((a) => (r || '').toLowerCase().includes(a.toLowerCase()));
  const wins = matches.filter((m) => /won/i.test(m.result || '') && ours(m.result)).length;

  const runs = lines.filter((x) => x.bat.runs > 0).sort((a, b) => b.bat.runs - a.bat.runs).slice(0, 5);
  const wkts = lines.filter((x) => x.bowl.wickets > 0).sort((a, b) => b.bowl.wickets - a.bowl.wickets || a.bowl.runs - b.bowl.runs).slice(0, 5);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : /(ch|sh|s|x)$/.test(w) ? 'es' : 's');

  let h = `<h3>${esc(config.season)} season so far</h3>\n`;
  h += `      <p>${esc(config.teamName)} have played ${plural(matches.length, 'match')} this season and won ${wins}.</p>\n`;
  if (runs.length) {
    h += `      <h3>Top run scorers</h3>\n      <ul>\n`;
    h += runs.map((x) => `        <li>${esc(name(x.player))}: ${plural(x.bat.runs, 'run')} in ${x.bat.inns} innings</li>`).join('\n');
    h += `\n      </ul>\n`;
  }
  if (wkts.length) {
    h += `      <h3>Top wicket takers</h3>\n      <ul>\n`;
    h += wkts.map((x) => `        <li>${esc(name(x.player))}: ${plural(x.bowl.wickets, 'wicket')}</li>`).join('\n');
    h += `\n      </ul>\n`;
  }
  h += `      <h3>Results</h3>\n      <ul>\n`;
  h += matches.map((m) => `        <li>${esc(m.date || '')} · ${esc(tName(m.tournament))} · ${esc(config.teamName)} vs ${esc(m.opponent || '')}${m.result ? ': ' + esc(m.result) : ''}</li>`).join('\n');
  h += `\n      </ul>`;
  return h;
}

function run() {
  const config = readJson('data/config.json');
  const { players } = readJson('data/players.json');
  const season = readJson('data/season.json');

  const indexPath = join(OUT, 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  if (!html.includes('<!--SEO:SUMMARY-->')) throw new Error('index.html has no <!--SEO:SUMMARY--> slot');
  writeFileSync(indexPath, html.replace('<!--SEO:SUMMARY-->', summaryHtml(config, players, season)));

  const lastmod = String(season.generatedAt || new Date().toISOString()).slice(0, 10);
  writeFileSync(join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url>\n    <loc>${SITE}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n</urlset>\n`);

  // /admin/ is kept out of results with <meta name="robots" content="noindex"> on the page itself.
  // It is not disallowed here: a blocked page can't be crawled, so Google would never see the noindex.
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

  console.log(`seo: summary for ${(season.matches || []).length} matches, sitemap lastmod ${lastmod}, site ${SITE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
