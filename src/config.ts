import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Severity, Issue } from './types.js';

export interface UnfuckConfig {
  ignore?: string[];
  severity?: Record<string, Severity>;
  disable?: string[];
  threshold?: number;
  maxFileSize?: number;
}

const DEFAULT_CONFIG: UnfuckConfig = {
  ignore: [],
  severity: {},
  disable: [],
  threshold: 50,
  maxFileSize: 300,
};

const CONFIG_FILENAMES = ['.unfckedrc', '.unfckedrc.json'];

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesPattern(title: string, pattern: string): boolean {
  if (pattern.includes('*') || pattern.includes('?')) {
    return globToRegex(pattern).test(title);
  }
  return title.toLowerCase() === pattern.toLowerCase();
}

export function loadConfig(dir: string): UnfuckConfig {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = join(dir, filename);
    if (existsSync(filepath)) {
      try {
        const raw = readFileSync(filepath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<UnfuckConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch {
        // Invalid config file — fall through to defaults
      }
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function applyConfig(issues: Issue[], config: UnfuckConfig): Issue[] {
  let filtered = issues;

  // Filter out disabled categories
  if (config.disable && config.disable.length > 0) {
    const disabled = new Set(config.disable.map(c => c.toLowerCase()));
    filtered = filtered.filter(issue => !disabled.has(issue.category.toLowerCase()));
  }

  // Filter out ignored issue titles
  if (config.ignore && config.ignore.length > 0) {
    filtered = filtered.filter(issue =>
      !config.ignore!.some(pattern => matchesPattern(issue.title, pattern))
    );
  }

  // Apply severity overrides
  if (config.severity && Object.keys(config.severity).length > 0) {
    filtered = filtered.map(issue => {
      for (const [pattern, sev] of Object.entries(config.severity!)) {
        if (matchesPattern(issue.title, pattern)) {
          return { ...issue, severity: sev };
        }
      }
      return issue;
    });
  }

  return filtered;
}

export function generateDefaultConfig(): string {
  const template: UnfuckConfig = {
    ignore: [],
    severity: {},
    disable: [],
    threshold: 50,
    maxFileSize: 300,
  };
  return JSON.stringify(template, null, 2) + '\n';
}

export function writeDefaultConfig(dir: string): string {
  const filepath = join(dir, '.unfckedrc.json');
  writeFileSync(filepath, generateDefaultConfig(), 'utf-8');
  return filepath;
}
