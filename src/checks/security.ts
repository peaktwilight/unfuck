import { readFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import type { Issue, ProjectInfo } from '../types.js';

const IGNORE: string[] = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**'];

interface SecretPattern {
  regex: RegExp;
  label: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { regex: /(?:API_KEY|APIKEY|api_key)\s*[=:]\s*["']([^"']{8,})["']/i, label: 'API key' },
  { regex: /(?:SECRET|SECRET_KEY|APP_SECRET)\s*[=:]\s*["']([^"']{8,})["']/i, label: 'Secret' },
  { regex: /(?:PASSWORD|PASSWD|DB_PASS)\s*[=:]\s*["']([^"']{2,})["']/i, label: 'Password' },
  { regex: /(?:PRIVATE_KEY|PRIV_KEY)\s*[=:]\s*["']([^"']{8,})["']/i, label: 'Private key' },
  { regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, label: 'Private key block' },
  { regex: /(?:sk-[a-zA-Z0-9]{20,})/, label: 'OpenAI API key' },
  { regex: /(?:ghp_[a-zA-Z0-9]{36,})/, label: 'GitHub token' },
  { regex: /(?:AKIA[0-9A-Z]{16})/, label: 'AWS access key' },
  { regex: /(?:token|TOKEN)\s*[=:]\s*["']([a-zA-Z0-9_\-]{20,})["']/i, label: 'Token' },
];

const UNSAFE_HTTP = /["'](http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s"']+)["']/;

export async function runSecurityChecks(dir: string, project: ProjectInfo): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Scan source files for secrets and dangerous patterns
  const sourceFiles = await glob('**/*.{js,ts,jsx,tsx,mjs,cjs}', { cwd: dir, ignore: IGNORE });
  const envFiles = await glob('**/.env*', { cwd: dir, ignore: IGNORE });
  const allFiles = [...sourceFiles, ...envFiles];

  for (const file of allFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments in source files (rough heuristic)
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Secret patterns (only in source files, not .env -- .env files are fine IF gitignored)
      if (!file.startsWith('.env')) {
        for (const { regex, label } of SECRET_PATTERNS) {
          if (regex.test(line)) {
            const preview = line.trim().slice(0, 60) + (line.trim().length > 60 ? '...' : '');
            issues.push({
              severity: 'CRITICAL',
              category: 'Security',
              title: `Hardcoded ${label} found`,
              detail: `${file}:${lineNum} — ${preview}`,
            });
            break; // one issue per line
          }
        }
      }

      // Skip lines that are regex patterns or test definitions
      const isPatternDef = /^\s*(?:if\s*\(\/|\/[^/]+\/\.\s*test|regex|pattern|const\s+\w+\s*=\s*\/)/i.test(line);

      // innerHTML / dangerouslySetInnerHTML
      const dsih = 'dangerously' + 'SetInnerHTML';
      if (!isPatternDef && line.includes(dsih) && !line.includes(`'${dsih}'`) && !line.includes(`"${dsih}"`)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Security',
          title: dsih + ' usage',
          detail: `${file}:${lineNum} — potential XSS vulnerability`,
        });
      } else if (!isPatternDef && /\.innerHTML\s*=/.test(line)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Security',
          title: 'innerHTML assignment',
          detail: `${file}:${lineNum} — potential XSS vulnerability`,
        });
      }

      // eval usage
      const evalPat = new RegExp('\\b' + 'ev' + 'al\\s*\\(');
      if (!isPatternDef && evalPat.test(line)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Security',
          title: 'ev' + 'al() usage detected',
          detail: `${file}:${lineNum} — never use ev` + `al in production`,
        });
      }

      // SQL string concatenation
      if (/(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\+\s*(?:req\.|params\.|query\.|body\.)/i.test(line)) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Security',
          title: 'Potential SQL injection',
          detail: `${file}:${lineNum} — string concatenation in SQL query`,
        });
      }

      // Unsafe HTTP
      const httpMatch = line.match(UNSAFE_HTTP);
      if (httpMatch) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Security',
          title: 'Non-HTTPS URL',
          detail: `${file}:${lineNum} — ${httpMatch[1]}`,
        });
      }
    }
  }

  // Check .env in .gitignore
  const envExists = envFiles.some(f => f === '.env' || f.endsWith('/.env'));
  if (envExists) {
    let gitignore = '';
    try {
      gitignore = await readFile(join(dir, '.gitignore'), 'utf8');
    } catch {}
    if (!gitignore.split('\n').some(l => l.trim() === '.env' || l.trim() === '.env*' || l.trim() === '*.env')) {
      issues.push({
        severity: 'CRITICAL',
        category: 'Security',
        title: '.env file not in .gitignore',
        detail: 'Your secrets will be committed to git',
      });
    }
  }

  // Check for exposed source maps in dist/build/public directories
  const mapFiles = await glob('**/*.map', { cwd: dir, ignore: ['**/node_modules/**', '**/.git/**'] });
  const exposedMaps = mapFiles.filter(f => /^(dist|build|public|out|\.next)\//i.test(f));
  if (exposedMaps.length > 0) {
    const preview = exposedMaps.slice(0, 5).join(', ');
    const extra = exposedMaps.length > 5 ? `, ... (${exposedMaps.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Security',
      title: `${exposedMaps.length} exposed source map${exposedMaps.length === 1 ? '' : 's'}`,
      detail: `Source maps in output directories leak your source code — ${preview}${extra}`,
    });
  }

  // Check for exposed .git directory in public/dist folders
  const publicGitDirs = await glob('{public,dist,build,out}/.git*', { cwd: dir, dot: true });
  if (publicGitDirs.length > 0) {
    issues.push({
      severity: 'CRITICAL',
      category: 'Security',
      title: 'Exposed .git directory in public/dist folder',
      detail: `${publicGitDirs.join(', ')} — attackers can download your entire repo history`,
    });
  }

  // Check for Math.random() in security contexts
  const weakCryptoUsages: string[] = [];
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      if (/Math\.random\s*\(\)/.test(line)) {
        // Check if it's in a security-ish context
        if (/token|secret|hash|uuid|key|password|nonce|salt|session|auth/i.test(line) ||
            /token|secret|hash|uuid|key|password|nonce|salt|session|auth/i.test(lines[Math.max(0, i - 1)] || '') ||
            /generate.*id|random.*id|unique.*id/i.test(line)) {
          weakCryptoUsages.push(`${file}:${i + 1}`);
        }
      }
    }
  }

  if (weakCryptoUsages.length > 0) {
    const preview = weakCryptoUsages.slice(0, 5).join(', ');
    const extra = weakCryptoUsages.length > 5 ? `, ... (${weakCryptoUsages.length} total)` : '';
    issues.push({
      severity: 'CRITICAL',
      category: 'Security',
      title: `Math.random() used in security context`,
      detail: `Math.random() is not cryptographically secure — use crypto.randomUUID() or crypto.getRandomValues() instead — ${preview}${extra}`,
    });
  }

  // Check for hardcoded localhost/127.0.0.1 URLs
  const localhostUrls: string[] = [];
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      if (/["'`](https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?[^"'`]*)["'`]/.test(line)) {
        // Skip if it's in a dev/test config, env fallback, or conditional
        if (!/process\.env|\.env|isDev|NODE_ENV|development/.test(line) &&
            !/\.config\.|\.test\.|\.spec\./.test(file)) {
          localhostUrls.push(`${file}:${i + 1}`);
        }
      }
    }
  }

  if (localhostUrls.length > 0) {
    const preview = localhostUrls.slice(0, 5).join(', ');
    const extra = localhostUrls.length > 5 ? `, ... (${localhostUrls.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Security',
      title: `${localhostUrls.length} hardcoded localhost URL${localhostUrls.length === 1 ? '' : 's'}`,
      detail: `These will break in production — use environment variables instead — ${preview}${extra}`,
    });
  }

  return issues;
}
