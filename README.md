# unfuck

> Your vibe-coded app has problems. This finds all of them.

AI coding tools get you 80% of the way there. This tool finds every issue in the last 20% -- the part that actually breaks in production, tanks your SEO, and leaks your API keys.

No AI. No API keys. Pure static analysis. Runs in seconds.

## Quick Start

```bash
git clone https://github.com/peaktwilight/unfuck
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

### :orange_circle: High -- fix before deploying
- Missing `<title>` tag, meta description, Open Graph tags
- Missing favicon, `robots.txt`, `sitemap.xml`
- No error boundary (React/Next.js -- crashes show a blank white screen)
- No loading states (users stare at nothing while data fetches)
- No 404/error page
- Missing `.gitignore` or `node_modules` not gitignored
- No `build` script in `package.json`
- `process.env` usage without fallback values
- Images missing `alt` attributes

### :yellow_circle: Medium -- should fix soon
- Dev dependencies in the wrong section (`typescript` in `dependencies`, etc.)
- Unused dependencies sitting in `package.json`
- Missing or stale lockfile
- Files over 300 lines
- Silent `catch` blocks (errors swallowed with no handling)

### :blue_circle: Low -- nice to have
- `console.log` statements left in code
- TODO/FIXME/HACK comments
- `any` type usage in TypeScript

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
node dist/cli.js /path/to/your/project --fix
```

Automatically fixes safe issues:
- Creates `.gitignore` with sensible defaults if missing
- Adds `.env` and `node_modules/` to `.gitignore`
- Moves dev dependencies (`typescript`, `eslint`, `jest`, `@types/*`, etc.) to `devDependencies`
- Shows before/after score so you can feel good about yourself

Won't touch anything risky. Won't delete your `console.log`s (you might need those, who knows).

## README Badge

```bash
node dist/cli.js /path/to/your/project --badge
```

Get a shields.io badge for your README:

![unfuck score](https://img.shields.io/badge/unfuck_score-83%2F100-green)

Paste the markdown into your README. Re-run after fixing issues to update your score.

## Flags

| Flag | What it does |
|------|-------------|
| `--fix` | Auto-fix safe issues, show before/after score |
| `--badge` | Generate a shields.io badge for your README |
| `--json` | Machine-readable JSON output |

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

## License

MIT
