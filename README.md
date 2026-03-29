# unfuck

[![npm](https://img.shields.io/npm/v/unfcked)](https://www.npmjs.com/package/unfcked)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)
![Checks: 45+](https://img.shields.io/badge/checks-45%2B-orange.svg)

[unfcked.doruk.ch](https://unfcked.doruk.ch) · [npm](https://www.npmjs.com/package/unfcked)

> Your vibe-coded app has problems. This finds all of them.

Published as `unfcked` on npm (because npm doesn't allow the full word 🙄)

AI coding tools get you 80% of the way there. This tool finds every issue in the last 20% -- the part that actually breaks in production, tanks your SEO, and leaks your API keys.

No AI. No API keys. **45+ checks.** Pure static analysis. Runs in seconds.

## Quick Start

```bash
# Scan current directory
npx unfcked

# Scan a specific project
npx unfcked /path/to/your/project
```

### Development

```bash
git clone https://github.com/peaktwilight/unfcked
cd unfuck
npm install
npm run build
node dist/cli.js /path/to/your/project
```

## What It Checks

### :red_circle: Critical -- fix these NOW
- Hardcoded API keys, secrets, passwords, and tokens in source code
- `.env` files not in `.gitignore` (your secrets *will* get committed)
- `eval()` usage
- `innerHTML` / `dangerouslySetInnerHTML` (XSS vulnerabilities)
- SQL injection patterns (string concatenation in queries)
- Non-HTTPS URLs
- Known key formats: OpenAI (`sk-`), GitHub (`ghp_`), AWS (`AKIA`)
- Exposed `.git` directory in public/dist folders
- Weak crypto (`Math.random()` in security contexts -- use `crypto.randomUUID()`)

### :orange_circle: High -- fix before deploying
- Missing `<title>` tag, meta description, Open Graph tags
- Missing favicon, `robots.txt`, `sitemap.xml`
- Missing charset declaration (`<meta charset="utf-8">`)
- No error boundary (React/Next.js -- crashes show a blank white screen)
- No loading states (users stare at nothing while data fetches)
- No 404/error page
- No tests (deploying without a safety net)
- Missing `.gitignore` or `node_modules` not gitignored
- No `build` script in `package.json`
- `process.env` usage without fallback values
- Images missing `alt` attributes
- Exposed source maps in output directories (leaks your source code)
- Hardcoded `localhost` / `127.0.0.1` URLs (will break in production)

### :yellow_circle: Medium -- should fix soon
- Dev dependencies in the wrong section (`typescript` in `dependencies`, etc.)
- Unused dependencies sitting in `package.json`
- Missing or stale lockfile
- Files over 300 lines
- Silent `catch` blocks (errors swallowed with no handling)
- Deeply nested code (4+ levels -- callback hell)
- TypeScript strict mode not enabled
- Missing canonical URL (duplicate content issues)
- Missing `lang` attribute on `<html>`
- No CI/CD configuration
- No README
- Bundle size check (>30 production dependencies)
- No `start` or `dev` script in `package.json`

### :blue_circle: Low -- nice to have
- `console.log` statements left in code
- TODO/FIXME/HACK comments
- `any` type usage in TypeScript
- Duplicate file names across directories
- Empty or near-empty files

## Watch Mode

```bash
# Live score updates as you fix issues
npx unfcked --watch /path/to/project
```

Re-scans automatically when files change. Fix an issue, see your score go up in real time.

## Scoring

Starts at 100. Every issue deducts points:

| Severity | Penalty |
|----------|---------|
| Critical | -20 |
| High | -10 |
| Medium | -5 |
| Low | -2 |

### Verdicts

| Score | Verdict |
|-------|---------|
| 90-100 | **CERTIFIED CLEAN** |
| 70-89 | **MOSTLY GOOD** |
| 50-69 | **NEEDS WORK** |
| 30-49 | **PRETTY ROUGH** |
| 0-29 | **DUMPSTER FIRE** |

## Auto-Fix

```bash
npx unfcked /path/to/your/project --fix
```

Automatically fixes safe issues:
- Creates `.gitignore` with sensible defaults if missing
- Adds `.env` and `node_modules/` to `.gitignore`
- Moves dev dependencies (`typescript`, `eslint`, `jest`, `@types/*`, etc.) to `devDependencies`
- Shows before/after score so you can feel good about yourself

Won't touch anything risky. Won't delete your `console.log`s (you might need those, who knows).

## README Badge

```bash
npx unfcked /path/to/your/project --badge
```

Get a shields.io badge for your README:

![unfcked score](https://img.shields.io/badge/unfcked_score-83%2F100-green)

Paste the markdown into your README. Re-run after fixing issues to update your score.

## Flags

| Flag | What it does |
|------|-------------|
| `--fix` | Auto-fix safe issues, show before/after score |
| `--watch` | Re-scan on file changes, live score updates |
| `--badge` | Generate a shields.io badge for your README |
| `--json` | Machine-readable JSON output |

## Development

```bash
git clone https://github.com/peaktwilight/unfcked
cd unfuck
npm install
npm run build
node dist/cli.js /path/to/your/project
```

## Framework Support

Auto-detects your stack and adjusts checks accordingly:

- **Next.js** -- React checks + SEO + production readiness
- **React** -- Error boundaries, loading states, JSX meta tags
- **Vue** / **Nuxt** -- Component scanning, SEO checks
- **Svelte** -- Component scanning, SEO checks
- **Node.js** -- Dependencies, security, production checks
- **Plain HTML** -- SEO, meta tags, accessibility

## Requirements

- Node.js 18+

That's it. No config files. No plugins. No twelve-step setup process.

## Why

You shipped a project with an AI coding tool. It works on your machine. But:

- There's an API key hardcoded on line 42
- There's no favicon
- The meta tags are missing so your links look broken on Twitter
- `typescript` is in `dependencies` instead of `devDependencies`
- There's no error boundary so one bad API response nukes the whole page
- There are 47 `console.log` statements

You won't find all of this by eyeballing it. This tool does.

## Full disclosure

This tool was 100% vibe-coded. We ran unfcked on itself. The circle of vibe is complete.

## License

MIT
