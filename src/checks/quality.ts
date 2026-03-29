import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { glob } from 'glob';
import type { Issue, ProjectInfo } from '../types.js';

const IGNORE: string[] = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**'];

export async function runQualityChecks(dir: string, project: ProjectInfo): Promise<Issue[]> {
  const issues: Issue[] = [];

  const sourceFiles = await glob('**/*.{js,ts,jsx,tsx,mjs,cjs}', { cwd: dir, ignore: IGNORE });

  const consoleLogs: string[] = [];
  const todos: string[] = [];
  const longFiles: Array<{ file: string; lines: number }> = [];
  const silentCatches: string[] = [];
  const anyTypes: string[] = [];

  for (const file of sourceFiles) {
    // Skip test files for console.log check
    const isTest = /\.(test|spec|e2e)\.|__tests__|__mocks__/.test(file);

    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');

    // Long file check
    if (lines.length > 300) {
      longFiles.push({ file, lines: lines.length });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // console.log (not in test/display files, not commented out, not string refs)
      const clPat = 'console' + '.log';
      if (!isTest && line.includes(clPat) && /\bconsole\.log\s*\(/.test(line) && !trimmed.startsWith('//') && !/['"`].*console\.log/.test(trimmed) && !/\/.*console/.test(trimmed)) {
        consoleLogs.push(`${file}:${lineNum}`);
      }

      // Check for leftover task comments (only actual comments, not string literals)
      const todoMatch = line.match(/\/\/.*\b(TODO|FIXME|HACK|XXX)\b|\/\*.*\b(TODO|FIXME|HACK|XXX)\b/);
      if (todoMatch) {
        todos.push(`${file}:${lineNum}`);
      }

      // TypeScript `any` type
      if (/\.tsx?$/.test(file)) {
        if (/:\s*any\b/.test(line) || /as\s+any\b/.test(line) || /<any>/.test(line)) {
          anyTypes.push(`${file}:${lineNum}`);
        }
      }
    }

    // Silent catch blocks -- look for catch blocks with empty body or just console
    const catchRegex = /catch\s*\([^)]*\)\s*\{([^}]*)}/g;
    let match: RegExpExecArray | null;
    while ((match = catchRegex.exec(content)) !== null) {
      const body = match[1].trim();
      if (body === '' || body === '// ignore' || body === '// noop') {
        const beforeCatch = content.slice(0, match.index);
        const lineNum = beforeCatch.split('\n').length;
        silentCatches.push(`${file}:${lineNum}`);
      }
    }
  }

  if (consoleLogs.length > 0) {
    const preview = consoleLogs.slice(0, 5).join(', ');
    const extra = consoleLogs.length > 5 ? `, ... (${consoleLogs.length} total)` : '';
    issues.push({
      severity: 'LOW',
      category: 'Quality',
      title: `${consoleLogs.length} console.log statement${consoleLogs.length === 1 ? '' : 's'} found`,
      detail: preview + extra,
    });
  }

  if (todos.length > 0) {
    const preview = todos.slice(0, 5).join(', ');
    const extra = todos.length > 5 ? `, ... (${todos.length} total)` : '';
    issues.push({
      severity: 'LOW',
      category: 'Quality',
      title: `${todos.length} TODO/FIXME comment${todos.length === 1 ? '' : 's'}`,
      detail: preview + extra,
    });
  }

  if (longFiles.length > 0) {
    const preview = longFiles.map(f => `${f.file} (${f.lines} lines)`).slice(0, 5).join(', ');
    issues.push({
      severity: 'MEDIUM',
      category: 'Quality',
      title: `${longFiles.length} file${longFiles.length === 1 ? '' : 's'} over 300 lines`,
      detail: preview,
    });
  }

  if (silentCatches.length > 0) {
    const preview = silentCatches.slice(0, 5).join(', ');
    const extra = silentCatches.length > 5 ? `, ... (${silentCatches.length} total)` : '';
    issues.push({
      severity: 'MEDIUM',
      category: 'Quality',
      title: `${silentCatches.length} silent catch block${silentCatches.length === 1 ? '' : 's'}`,
      detail: `Errors swallowed silently — ${preview}${extra}`,
    });
  }

  if (anyTypes.length > 0) {
    const preview = anyTypes.slice(0, 5).join(', ');
    const extra = anyTypes.length > 5 ? `, ... (${anyTypes.length} total)` : '';
    issues.push({
      severity: 'LOW',
      category: 'Quality',
      title: `${anyTypes.length} \`any\` type usage${anyTypes.length === 1 ? '' : 's'} in TypeScript`,
      detail: preview + extra,
    });
  }

  // Duplicate file name detection (files with identical names in different directories)
  const filesByName = new Map<string, string[]>();
  for (const file of sourceFiles) {
    const name = basename(file);
    // Skip index files and common generic names
    if (/^index\.(js|ts|jsx|tsx|mjs|cjs)$/.test(name)) continue;
    const existing = filesByName.get(name) || [];
    existing.push(file);
    filesByName.set(name, existing);
  }
  const duplicates = [...filesByName.entries()].filter(([, files]) => files.length > 1);
  if (duplicates.length > 0) {
    const preview = duplicates.slice(0, 3).map(([name, files]) => `${name} (${files.length}x)`).join(', ');
    const extra = duplicates.length > 3 ? `, ... (${duplicates.length} total)` : '';
    issues.push({
      severity: 'LOW',
      category: 'Quality',
      title: `${duplicates.length} duplicate file name${duplicates.length === 1 ? '' : 's'} across directories`,
      detail: `Possible code duplication — ${preview}${extra}`,
    });
  }

  // Empty files (< 5 lines of actual code)
  const emptyFiles: string[] = [];
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const codeLines = content.split('\n').filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('import ') && !t.startsWith('export {}');
    });
    if (codeLines.length < 5) {
      emptyFiles.push(file);
    }
  }

  if (emptyFiles.length > 0) {
    const preview = emptyFiles.slice(0, 5).join(', ');
    const extra = emptyFiles.length > 5 ? `, ... (${emptyFiles.length} total)` : '';
    issues.push({
      severity: 'LOW',
      category: 'Quality',
      title: `${emptyFiles.length} empty or near-empty file${emptyFiles.length === 1 ? '' : 's'}`,
      detail: `Files with < 5 lines of actual code — ${preview}${extra}`,
    });
  }

  // Deeply nested callbacks (4+ levels of indentation — callback hell indicator)
  const deeplyNested: string[] = [];
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) continue;

      // Count leading whitespace depth (tabs = 1 level, 2/4 spaces = 1 level)
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
      const tabCount = (leadingSpaces.match(/\t/g) || []).length;
      const spaceCount = leadingSpaces.replace(/\t/g, '').length;
      const depth = tabCount + Math.floor(spaceCount / 2);

      // 4+ levels with a callback-like pattern (function, =>, {)
      if (depth >= 8 && /[{(]|=>/.test(line)) {
        deeplyNested.push(`${file}:${i + 1}`);
        break; // one per file is enough
      }
    }
  }

  if (deeplyNested.length > 0) {
    const preview = deeplyNested.slice(0, 5).join(', ');
    const extra = deeplyNested.length > 5 ? `, ... (${deeplyNested.length} total)` : '';
    issues.push({
      severity: 'MEDIUM',
      category: 'Quality',
      title: `${deeplyNested.length} file${deeplyNested.length === 1 ? '' : 's'} with deeply nested code`,
      detail: `4+ levels of nesting detected (callback hell) — ${preview}${extra}`,
    });
  }

  // Check for TypeScript strict mode
  try {
    const tsconfig = await readFile(join(dir, 'tsconfig.json'), 'utf8');
    const parsed = JSON.parse(tsconfig);
    if (!parsed?.compilerOptions?.strict) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Quality',
        title: 'TypeScript strict mode is not enabled',
        detail: 'tsconfig.json — set "strict": true in compilerOptions for better type safety',
      });
    }
  } catch {
    // No tsconfig.json — that's fine, not a TS project or no config
  }

  return issues;
}
