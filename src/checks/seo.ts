import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import type { Issue, ProjectInfo } from '../types.js';

const IGNORE: string[] = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**'];

export async function runSeoChecks(dir: string, project: ProjectInfo): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Find HTML files
  const htmlFiles = await glob('**/*.{html,htm}', { cwd: dir, ignore: IGNORE });

  // Also check JSX/TSX for React-based projects that might use react-helmet or Next.js Head
  const isWebProject = ['React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'HTML'].includes(project.type);

  if (!isWebProject) return issues;

  let hasTitle = false;
  let hasMetaDesc = false;
  let hasOgImage = false;
  let hasOgTitle = false;
  let hasOgDesc = false;
  let hasFavicon = false;
  const missingAlt: string[] = [];

  for (const file of htmlFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    if (/<title[^>]*>/.test(content)) hasTitle = true;
    if (/meta\s+[^>]*name\s*=\s*["']description["']/i.test(content)) hasMetaDesc = true;
    if (/meta\s+[^>]*property\s*=\s*["']og:image["']/i.test(content)) hasOgImage = true;
    if (/meta\s+[^>]*property\s*=\s*["']og:title["']/i.test(content)) hasOgTitle = true;
    if (/meta\s+[^>]*property\s*=\s*["']og:description["']/i.test(content)) hasOgDesc = true;
    if (/rel\s*=\s*["'](?:shortcut )?icon["']/i.test(content) || /favicon/i.test(content)) hasFavicon = true;

    // Check images without alt
    const imgMatches = content.matchAll(/<img\s[^>]*?>/gi);
    for (const match of imgMatches) {
      if (!/\balt\s*=/i.test(match[0])) {
        const lines = content.slice(0, match.index).split('\n');
        missingAlt.push(`${file}:${lines.length}`);
      }
    }
  }

  // For React/Next projects, also check JSX files for Head/Helmet usage
  if (['React', 'Next.js'].includes(project.type)) {
    const jsxFiles = await glob('**/*.{jsx,tsx,js,ts}', { cwd: dir, ignore: IGNORE });
    for (const file of jsxFiles) {
      let content: string;
      try {
        content = await readFile(join(dir, file), 'utf8');
      } catch { continue; }

      if (/<title[^>]*>/.test(content) || /title\s*[:=]/.test(content)) hasTitle = true;
      if (/name\s*[:=]\s*["']description["']/i.test(content)) hasMetaDesc = true;
      if (/property\s*[:=]\s*["']og:image["']/i.test(content)) hasOgImage = true;
      if (/property\s*[:=]\s*["']og:title["']/i.test(content)) hasOgTitle = true;
      if (/property\s*[:=]\s*["']og:description["']/i.test(content)) hasOgDesc = true;
    }
  }

  if (!hasTitle) {
    issues.push({
      severity: 'HIGH',
      category: 'SEO',
      title: 'Missing <title> tag',
      detail: 'No <title> found in HTML files — critical for SEO and browser tabs',
    });
  }

  if (!hasMetaDesc) {
    issues.push({
      severity: 'HIGH',
      category: 'SEO',
      title: 'Missing meta description',
      detail: 'Add <meta name="description" content="..."> for search results',
    });
  }

  const missingOg: string[] = [];
  if (!hasOgTitle) missingOg.push('og:title');
  if (!hasOgDesc) missingOg.push('og:description');
  if (!hasOgImage) missingOg.push('og:image');
  if (missingOg.length > 0) {
    issues.push({
      severity: 'HIGH',
      category: 'SEO',
      title: 'Missing Open Graph tags',
      detail: `Missing ${missingOg.join(', ')} — links shared on social media will look broken`,
    });
  }

  if (!hasFavicon) {
    // Also check for favicon file
    const faviconFiles = await glob('**/favicon.{ico,png,svg}', { cwd: dir, ignore: IGNORE });
    if (faviconFiles.length === 0) {
      issues.push({
        severity: 'HIGH',
        category: 'SEO',
        title: 'Missing favicon',
        detail: 'No favicon found — browsers will show a generic icon',
      });
    }
  }

  if (missingAlt.length > 0) {
    const preview = missingAlt.slice(0, 5).join(', ');
    const extra = missingAlt.length > 5 ? `, ... (${missingAlt.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'SEO',
      title: `${missingAlt.length} image(s) missing alt attribute`,
      detail: preview + extra,
    });
  }

  // Check for robots.txt and sitemap.xml
  const publicDir = htmlFiles.length > 0 ? '' : 'public/';
  try {
    await access(join(dir, publicDir, 'robots.txt'));
  } catch {
    try {
      await access(join(dir, 'robots.txt'));
    } catch {
      issues.push({
        severity: 'HIGH',
        category: 'SEO',
        title: 'Missing robots.txt',
        detail: 'Search engines need robots.txt for crawling instructions',
      });
    }
  }

  try {
    await access(join(dir, publicDir, 'sitemap.xml'));
  } catch {
    try {
      await access(join(dir, 'sitemap.xml'));
    } catch {
      issues.push({
        severity: 'HIGH',
        category: 'SEO',
        title: 'Missing sitemap.xml',
        detail: 'A sitemap helps search engines discover all your pages',
      });
    }
  }

  return issues;
}
