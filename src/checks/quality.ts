import { readFile } from 'fs/promises';
import { join } from 'path';
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

  return issues;
}
