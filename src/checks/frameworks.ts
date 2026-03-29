import { readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { glob } from 'glob';
import type { Issue, ProjectInfo } from '../types.js';

const IGNORE: string[] = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**'];

export async function runFrameworkChecks(dir: string, project: ProjectInfo): Promise<Issue[]> {
  const issues: Issue[] = [];

  if (project.type === 'Next.js') {
    await checkNextJs(dir, project, issues);
  }

  if (project.type === 'React' || project.type === 'Next.js') {
    await checkReact(dir, project, issues);
  }

  if (project.type === 'Vue' || project.type === 'Nuxt') {
    await checkVueNuxt(dir, project, issues);
  }

  await checkGeneral(dir, project, issues);

  return issues;
}

async function checkNextJs(dir: string, project: ProjectInfo, issues: Issue[]): Promise<void> {
  // Detect app router usage
  const appDirs = await glob('**/app/**/page.{js,jsx,ts,tsx}', { cwd: dir, ignore: IGNORE });
  const hasAppRouter = appDirs.length > 0;

  if (hasAppRouter) {
    // Collect unique app router directories that contain page files
    const appRouterDirs = new Set<string>();
    for (const pageFile of appDirs) {
      appRouterDirs.add(dirname(pageFile));
    }

    // Check for missing loading.tsx in app router directories
    const dirsWithoutLoading: string[] = [];
    for (const appDir of appRouterDirs) {
      const loadingFiles = await glob(join(appDir, 'loading.{js,jsx,ts,tsx}'), { cwd: dir });
      if (loadingFiles.length === 0) {
        dirsWithoutLoading.push(appDir);
      }
    }
    if (dirsWithoutLoading.length > 0) {
      const preview = dirsWithoutLoading.slice(0, 5).join(', ');
      const extra = dirsWithoutLoading.length > 5 ? `, ... (${dirsWithoutLoading.length} total)` : '';
      issues.push({
        severity: 'HIGH',
        category: 'Framework',
        title: `Missing loading.tsx in ${dirsWithoutLoading.length} app router route${dirsWithoutLoading.length === 1 ? '' : 's'}`,
        detail: `Add loading.tsx for better UX during navigation — ${preview}${extra}`,
      });
    }

    // Check for missing error.tsx in app router directories
    const dirsWithoutError: string[] = [];
    for (const appDir of appRouterDirs) {
      const errorFiles = await glob(join(appDir, 'error.{js,jsx,ts,tsx}'), { cwd: dir });
      if (errorFiles.length === 0) {
        dirsWithoutError.push(appDir);
      }
    }
    if (dirsWithoutError.length > 0) {
      const preview = dirsWithoutError.slice(0, 5).join(', ');
      const extra = dirsWithoutError.length > 5 ? `, ... (${dirsWithoutError.length} total)` : '';
      issues.push({
        severity: 'HIGH',
        category: 'Framework',
        title: `Missing error.tsx in ${dirsWithoutError.length} app router route${dirsWithoutError.length === 1 ? '' : 's'}`,
        detail: `Add error.tsx to handle runtime errors gracefully — ${preview}${extra}`,
      });
    }

    // Check for missing metadata exports in page files
    const pagesWithoutMetadata: string[] = [];
    for (const pageFile of appDirs) {
      let content: string;
      try {
        content = await readFile(join(dir, pageFile), 'utf8');
      } catch { continue; }

      const hasMetadata = /export\s+(?:const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(content);
      // Also check if a layout in the same dir exports metadata
      if (!hasMetadata) {
        const layoutFiles = await glob(join(dirname(pageFile), 'layout.{js,jsx,ts,tsx}'), { cwd: dir });
        let layoutHasMetadata = false;
        for (const layoutFile of layoutFiles) {
          try {
            const layoutContent = await readFile(join(dir, layoutFile), 'utf8');
            if (/export\s+(?:const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(layoutContent)) {
              layoutHasMetadata = true;
              break;
            }
          } catch { continue; }
        }
        if (!layoutHasMetadata) {
          pagesWithoutMetadata.push(pageFile);
        }
      }
    }
    if (pagesWithoutMetadata.length > 0) {
      const preview = pagesWithoutMetadata.slice(0, 5).join(', ');
      const extra = pagesWithoutMetadata.length > 5 ? `, ... (${pagesWithoutMetadata.length} total)` : '';
      issues.push({
        severity: 'MEDIUM',
        category: 'Framework',
        title: `Missing metadata export in ${pagesWithoutMetadata.length} page file${pagesWithoutMetadata.length === 1 ? '' : 's'}`,
        detail: `Export metadata or generateMetadata for SEO — ${preview}${extra}`,
      });
    }

    // Check for getServerSideProps usage when app router is available (migration hint)
    const pagesWithGssp: string[] = [];
    const allSourceFiles = await glob('**/*.{js,jsx,ts,tsx}', { cwd: dir, ignore: IGNORE });
    for (const file of allSourceFiles) {
      let content: string;
      try {
        content = await readFile(join(dir, file), 'utf8');
      } catch { continue; }
      if (/export\s+(?:async\s+)?function\s+getServerSideProps/.test(content)) {
        pagesWithGssp.push(file);
      }
    }
    if (pagesWithGssp.length > 0) {
      const preview = pagesWithGssp.slice(0, 5).join(', ');
      const extra = pagesWithGssp.length > 5 ? `, ... (${pagesWithGssp.length} total)` : '';
      issues.push({
        severity: 'LOW',
        category: 'Framework',
        title: `${pagesWithGssp.length} file${pagesWithGssp.length === 1 ? '' : 's'} still using getServerSideProps`,
        detail: `Consider migrating to app router Server Components — ${preview}${extra}`,
      });
    }
  }

  // Check for missing next.config
  const nextConfigFiles = await glob('next.config.{js,mjs,ts}', { cwd: dir });
  if (nextConfigFiles.length === 0) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Framework',
      title: 'Missing next.config.js or next.config.mjs',
      detail: 'Add a Next.js config file to customize build behavior, redirects, headers, etc.',
    });
  }
}

async function checkReact(dir: string, project: ProjectInfo, issues: Issue[]): Promise<void> {
  const sourceFiles = await glob('**/*.{jsx,tsx}', { cwd: dir, ignore: IGNORE });

  const effectWithoutCleanup: string[] = [];
  const missingKeyProp: string[] = [];
  const effectWithoutDeps: string[] = [];
  const indexAsKey: string[] = [];

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

      // useEffect without cleanup when using subscriptions/timers
      if (/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/.test(line)) {
        // Look ahead up to 20 lines for the effect body
        const effectBody: string[] = [];
        let braceCount = 0;
        let started = false;
        for (let j = i; j < Math.min(i + 30, lines.length); j++) {
          effectBody.push(lines[j]);
          for (const ch of lines[j]) {
            if (ch === '{') { braceCount++; started = true; }
            if (ch === '}') braceCount--;
          }
          if (started && braceCount <= 0) break;
        }
        const body = effectBody.join('\n');
        const hasSubscription = /addEventListener|subscribe|setInterval|setTimeout|\.on\(/.test(body);
        const hasCleanup = /return\s*\(\s*\)\s*=>|return\s+function|return\s*\(\)\s*\{/.test(body);
        if (hasSubscription && !hasCleanup) {
          effectWithoutCleanup.push(`${file}:${i + 1}`);
        }
      }

      // Missing key prop in .map() rendered JSX
      // Pattern: .map( ... => ( <Tag  or .map( ... => <Tag  without key=
      if (/\.map\s*\(/.test(line)) {
        const mapBlock: string[] = [];
        let parenCount = 0;
        let started2 = false;
        for (let j = i; j < Math.min(i + 20, lines.length); j++) {
          mapBlock.push(lines[j]);
          for (const ch of lines[j]) {
            if (ch === '(') { parenCount++; started2 = true; }
            if (ch === ')') parenCount--;
          }
          if (started2 && parenCount <= 0) break;
        }
        const block = mapBlock.join('\n');
        const hasJsx = /<\w+/.test(block);
        const hasKey = /key\s*=/.test(block);
        if (hasJsx && !hasKey) {
          missingKeyProp.push(`${file}:${i + 1}`);
        }
      }

      // State updates in useEffect without dependency array
      if (/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/.test(line)) {
        const effectLines: string[] = [];
        let bc = 0;
        let s = false;
        for (let j = i; j < Math.min(i + 30, lines.length); j++) {
          effectLines.push(lines[j]);
          for (const ch of lines[j]) {
            if (ch === '{') { bc++; s = true; }
            if (ch === '}') bc--;
          }
          if (s && bc <= 0) break;
        }
        const fullEffect = effectLines.join('\n');
        const hasSetState = /set[A-Z]\w*\s*\(/.test(fullEffect);
        // Check if the useEffect call ends without a dependency array (no , [...])
        const hasDepArray = /\}\s*,\s*\[/.test(fullEffect);
        if (hasSetState && !hasDepArray) {
          effectWithoutDeps.push(`${file}:${i + 1}`);
        }
      }

      // Using index as key in lists
      if (/\.map\s*\(\s*\([^)]*,\s*(\w+)\)/.test(line) || /\.map\s*\(\s*[^(,]+,\s*(\w+)\s*=>/.test(line)) {
        const idxMatch = line.match(/\.map\s*\(\s*\([^)]*,\s*(\w+)\)/) || line.match(/\.map\s*\(\s*[^(,]+,\s*(\w+)\s*=>/);
        if (idxMatch) {
          const idxName = idxMatch[1];
          // Look ahead for key={idxName}
          const mapBlock: string[] = [];
          let pc = 0;
          let st = false;
          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            mapBlock.push(lines[j]);
            for (const ch of lines[j]) {
              if (ch === '(') { pc++; st = true; }
              if (ch === ')') pc--;
            }
            if (st && pc <= 0) break;
          }
          const block = mapBlock.join('\n');
          const keyPattern = new RegExp(`key\\s*=\\s*\\{\\s*${idxName}\\s*\\}`);
          if (keyPattern.test(block)) {
            indexAsKey.push(`${file}:${i + 1}`);
          }
        }
      }
    }
  }

  if (effectWithoutCleanup.length > 0) {
    const preview = effectWithoutCleanup.slice(0, 5).join(', ');
    const extra = effectWithoutCleanup.length > 5 ? `, ... (${effectWithoutCleanup.length} total)` : '';
    issues.push({
      severity: 'MEDIUM',
      category: 'Framework',
      title: `${effectWithoutCleanup.length} useEffect${effectWithoutCleanup.length === 1 ? '' : 's'} with subscriptions/timers missing cleanup`,
      detail: `Return a cleanup function to avoid memory leaks — ${preview}${extra}`,
    });
  }

  if (missingKeyProp.length > 0) {
    const preview = missingKeyProp.slice(0, 5).join(', ');
    const extra = missingKeyProp.length > 5 ? `, ... (${missingKeyProp.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Framework',
      title: `Missing key prop in ${missingKeyProp.length} .map() rendered JSX`,
      detail: `Add a unique key prop to each element — ${preview}${extra}`,
    });
  }

  if (effectWithoutDeps.length > 0) {
    const preview = effectWithoutDeps.slice(0, 5).join(', ');
    const extra = effectWithoutDeps.length > 5 ? `, ... (${effectWithoutDeps.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Framework',
      title: `${effectWithoutDeps.length} useEffect${effectWithoutDeps.length === 1 ? '' : 's'} with state updates but no dependency array`,
      detail: `This causes infinite re-renders — add a dependency array — ${preview}${extra}`,
    });
  }

  if (indexAsKey.length > 0) {
    const preview = indexAsKey.slice(0, 5).join(', ');
    const extra = indexAsKey.length > 5 ? `, ... (${indexAsKey.length} total)` : '';
    issues.push({
      severity: 'LOW',
      category: 'Framework',
      title: `${indexAsKey.length} list${indexAsKey.length === 1 ? '' : 's'} using index as key`,
      detail: `Using array index as key can cause rendering bugs — use a stable unique identifier — ${preview}${extra}`,
    });
  }
}

async function checkVueNuxt(dir: string, project: ProjectInfo, issues: Issue[]): Promise<void> {
  const vueFiles = await glob('**/*.vue', { cwd: dir, ignore: IGNORE });

  const missingVForKey: string[] = [];
  const mutatingProps: string[] = [];

  for (const file of vueFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Missing v-bind:key or :key in v-for loops
      if (/v-for\s*=/.test(line)) {
        // Check current line and next line for :key or v-bind:key
        const context = line + (lines[i + 1] || '');
        if (!/:key\s*=/.test(context) && !/v-bind:key\s*=/.test(context)) {
          missingVForKey.push(`${file}:${i + 1}`);
        }
      }

      // Mutating props directly (this.propName = ... in Options API, or props.x = ... in Composition API)
      // Options API: look for direct assignment to a known prop
      if (/this\.\$props\.\w+\s*=/.test(line)) {
        mutatingProps.push(`${file}:${i + 1}`);
      }
      // Composition API: props.xxx = value
      if (/props\.\w+\s*=[^=]/.test(line) && !/===|!==|==|!=|=>/.test(line.slice(line.indexOf('props.')))) {
        // Make sure it's an assignment not comparison
        const afterProps = line.slice(line.indexOf('props.'));
        const assignMatch = afterProps.match(/^props\.\w+\s*=([^=])/);
        if (assignMatch) {
          mutatingProps.push(`${file}:${i + 1}`);
        }
      }
    }
  }

  if (missingVForKey.length > 0) {
    const preview = missingVForKey.slice(0, 5).join(', ');
    const extra = missingVForKey.length > 5 ? `, ... (${missingVForKey.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Framework',
      title: `Missing :key in ${missingVForKey.length} v-for loop${missingVForKey.length === 1 ? '' : 's'}`,
      detail: `Always bind a unique key with v-for — ${preview}${extra}`,
    });
  }

  if (mutatingProps.length > 0) {
    const preview = mutatingProps.slice(0, 5).join(', ');
    const extra = mutatingProps.length > 5 ? `, ... (${mutatingProps.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Framework',
      title: `${mutatingProps.length} direct prop mutation${mutatingProps.length === 1 ? '' : 's'}`,
      detail: `Props are read-only — emit an event or use a local copy instead — ${preview}${extra}`,
    });
  }
}

async function checkGeneral(dir: string, project: ProjectInfo, issues: Issue[]): Promise<void> {
  // Bundle size: warn if node_modules > 500MB
  try {
    const nmStat = await stat(join(dir, 'node_modules'));
    if (nmStat.isDirectory()) {
      // Use du to get folder size (faster than walking the tree)
      const { execSync } = await import('child_process');
      try {
        const output = execSync(`du -sk "${join(dir, 'node_modules')}"`, { encoding: 'utf8', timeout: 10000 });
        const sizeKb = parseInt(output.split('\t')[0], 10);
        const sizeMb = Math.round(sizeKb / 1024);
        if (sizeMb > 500) {
          issues.push({
            severity: 'MEDIUM',
            category: 'Framework',
            title: `node_modules is ${sizeMb}MB`,
            detail: 'Consider auditing dependencies — run `npx depcheck` to find unused packages',
          });
        }
      } catch { /* du failed, skip */ }
    }
  } catch { /* no node_modules, skip */ }

  // No .nvmrc or engines field for Node version pinning
  let hasNvmrc = false;
  try {
    await stat(join(dir, '.nvmrc'));
    hasNvmrc = true;
  } catch {}

  let hasNodeVersion = false;
  try {
    await stat(join(dir, '.node-version'));
    hasNodeVersion = true;
  } catch {}

  const hasEngines = !!project.pkg?.engines;

  if (!hasNvmrc && !hasNodeVersion && !hasEngines) {
    issues.push({
      severity: 'LOW',
      category: 'Framework',
      title: 'No Node.js version pinning',
      detail: 'Add a .nvmrc file or "engines" field in package.json to ensure consistent Node.js versions across environments',
    });
  }
}
