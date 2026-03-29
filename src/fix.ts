import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { Issue, PackageJson } from './types.js';

export interface FixResult {
  issue: Issue;
  fixed: boolean;
  message: string;
}

const DEV_ONLY_IN_DEPS = new Set([
  'typescript', 'eslint', 'jest', 'vitest', 'prettier',
  'mocha', 'chai', 'cypress', 'playwright',
  '@testing-library/react', '@testing-library/jest-dom',
  'ts-jest', 'nodemon', 'ts-node', 'husky', 'lint-staged',
  'webpack-dev-server', 'storybook', '@storybook/react',
]);

function isDevOnlyPkg(name: string): boolean {
  if (DEV_ONLY_IN_DEPS.has(name)) return true;
  if (name.startsWith('@types/')) return true;
  return false;
}

const DEFAULT_GITIGNORE = `node_modules/
dist/
.env
.DS_Store
`;

export async function autoFix(issues: Issue[], projectDir: string): Promise<FixResult[]> {
  const results: FixResult[] = [];

  for (const issue of issues) {
    const result = await tryFix(issue, projectDir);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

async function tryFix(issue: Issue, dir: string): Promise<FixResult | null> {
  // console.log statements -- skip (too risky)
  if (issue.title.includes('console.log')) {
    return {
      issue,
      fixed: false,
      message: 'console.log removal (too risky for auto-fix)',
    };
  }

  // .env not in .gitignore
  if (issue.title === '.env file not in .gitignore') {
    return await fixGitignoreEntry(issue, dir, '.env');
  }

  // node_modules not in .gitignore
  if (issue.title === 'node_modules not in .gitignore') {
    return await fixGitignoreEntry(issue, dir, 'node_modules/');
  }

  // Missing .gitignore
  if (issue.title === 'Missing .gitignore') {
    try {
      await writeFile(join(dir, '.gitignore'), DEFAULT_GITIGNORE, 'utf8');
      return {
        issue,
        fixed: true,
        message: 'created .gitignore with common defaults',
      };
    } catch (err) {
      return {
        issue,
        fixed: false,
        message: `failed to create .gitignore: ${(err as Error).message}`,
      };
    }
  }

  // Dev dependency in wrong section
  if (issue.title === 'Dev dependency in wrong section') {
    return await fixDevDeps(issue, dir);
  }

  return null;
}

async function fixGitignoreEntry(issue: Issue, dir: string, entry: string): Promise<FixResult> {
  const gitignorePath = join(dir, '.gitignore');
  let content = '';
  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch {
    // File doesn't exist, will create
  }

  const lines = content.split('\n');
  const alreadyHas = lines.some(l => l.trim() === entry);

  if (alreadyHas) {
    return { issue, fixed: true, message: `${entry} already in .gitignore` };
  }

  const newContent = content.endsWith('\n') || content === ''
    ? content + entry + '\n'
    : content + '\n' + entry + '\n';

  try {
    await writeFile(gitignorePath, newContent, 'utf8');
    return { issue, fixed: true, message: `${entry} added to .gitignore` };
  } catch (err) {
    return { issue, fixed: false, message: `failed to update .gitignore: ${(err as Error).message}` };
  }
}

async function fixDevDeps(issue: Issue, dir: string): Promise<FixResult> {
  const pkgPath = join(dir, 'package.json');
  let raw: string;
  try {
    raw = await readFile(pkgPath, 'utf8');
  } catch (err) {
    return { issue, fixed: false, message: `failed to read package.json: ${(err as Error).message}` };
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch (err) {
    return { issue, fixed: false, message: `failed to parse package.json: ${(err as Error).message}` };
  }

  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};
  const moved: string[] = [];

  for (const name of Object.keys(deps)) {
    if (isDevOnlyPkg(name)) {
      devDeps[name] = deps[name];
      delete deps[name];
      moved.push(name);
    }
  }

  if (moved.length === 0) {
    return { issue, fixed: true, message: 'no misplaced dev dependencies found' };
  }

  pkg.dependencies = deps;
  pkg.devDependencies = devDeps;

  try {
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    return {
      issue,
      fixed: true,
      message: `moved ${moved.join(', ')} to devDependencies`,
    };
  } catch (err) {
    return { issue, fixed: false, message: `failed to write package.json: ${(err as Error).message}` };
  }
}
