import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import type { Issue, ProjectInfo } from '../types.js';

const IGNORE: string[] = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**'];

// Packages that are used implicitly (config-based, plugins, etc.)
const IMPLICIT_PACKAGES = new Set([
  'typescript', '@types/', 'eslint', 'prettier', 'postcss', 'autoprefixer',
  'tailwindcss', '@tailwindcss/', 'babel', '@babel/', 'webpack', 'vite',
  'next', 'nuxt', '@vitejs/', 'sass', 'less', 'stylus', 'husky', 'lint-staged',
  'nodemon', 'ts-node', 'tsx', 'concurrently', 'cross-env', 'dotenv',
  'encoding', 'bufferutil', 'utf-8-validate',
]);

const DEV_ONLY_PACKAGES = new Set([
  'typescript', 'eslint', 'prettier', 'jest', 'mocha', 'chai', 'vitest',
  'cypress', 'playwright', '@testing-library/react', '@testing-library/jest-dom',
  'ts-jest', 'nodemon', 'ts-node', 'husky', 'lint-staged', '@types/node',
  '@types/react', '@types/jest', 'webpack-dev-server', 'storybook',
  '@storybook/react',
]);

function isImplicit(name: string): boolean {
  if (IMPLICIT_PACKAGES.has(name)) return true;
  for (const prefix of IMPLICIT_PACKAGES) {
    if (prefix.endsWith('/') && name.startsWith(prefix)) return true;
  }
  return false;
}

export async function runDepsChecks(dir: string, project: ProjectInfo): Promise<Issue[]> {
  const issues: Issue[] = [];
  const pkg = project.pkg;

  if (!pkg) return issues;

  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};

  // Check for dev dependencies in regular dependencies
  const misplaced = Object.keys(deps).filter(d => DEV_ONLY_PACKAGES.has(d));
  if (misplaced.length > 0) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Dependencies',
      title: 'Dev dependency in wrong section',
      detail: `${misplaced.join(', ')} — should be in "devDependencies"`,
    });
  }

  // Check for unused dependencies
  const allDeps = Object.keys(deps);
  if (allDeps.length > 0) {
    const sourceFiles = await glob('**/*.{js,ts,jsx,tsx,mjs,cjs,vue,svelte}', { cwd: dir, ignore: IGNORE });
    let allSource = '';
    for (const file of sourceFiles) {
      try {
        allSource += await readFile(join(dir, file), 'utf8') + '\n';
      } catch {}
    }

    // Also check config files
    const configFiles = await glob('{*.config.*,.*rc,.*.js,.*.cjs,.*.mjs}', { cwd: dir, ignore: IGNORE });
    for (const file of configFiles) {
      try {
        allSource += await readFile(join(dir, file), 'utf8') + '\n';
      } catch {}
    }

    const unused = allDeps.filter(dep => {
      if (isImplicit(dep)) return false;
      // Check for import/require of the package
      const patterns = [
        `from '${dep}`,
        `from "${dep}`,
        `require('${dep}`,
        `require("${dep}`,
        `import '${dep}`,
        `import "${dep}`,
      ];
      return !patterns.some(p => allSource.includes(p));
    });

    if (unused.length > 0) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Dependencies',
        title: `${unused.length} unused dependenc${unused.length === 1 ? 'y' : 'ies'}`,
        detail: `${unused.join(', ')} — in package.json but never imported`,
      });
    }
  }

  // Check lockfile
  let hasLockfile = false;
  let lockfilePath = '';
  for (const name of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb']) {
    try {
      await stat(join(dir, name));
      hasLockfile = true;
      lockfilePath = name;
      break;
    } catch {}
  }

  if (!hasLockfile) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Dependencies',
      title: 'No lockfile found',
      detail: 'Run npm install to generate package-lock.json for reproducible builds',
    });
  } else if (lockfilePath === 'package-lock.json') {
    // Check if lockfile is older than package.json
    try {
      const lockStat = await stat(join(dir, lockfilePath));
      const pkgStat = await stat(join(dir, 'package.json'));
      if (lockStat.mtimeMs < pkgStat.mtimeMs) {
        issues.push({
          severity: 'MEDIUM',
          category: 'Dependencies',
          title: 'Lockfile may be outdated',
          detail: 'package-lock.json is older than package.json — run npm install',
        });
      }
    } catch {}
  }

  return issues;
}
