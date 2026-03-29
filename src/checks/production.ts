import { readFile, access, stat } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import type { Issue, ProjectInfo } from '../types.js';

const IGNORE: string[] = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**', '**/out/**'];

export async function runProductionChecks(dir: string, project: ProjectInfo): Promise<Issue[]> {
  const issues: Issue[] = [];
  const pkg = project.pkg;
  const isReact = ['React', 'Next.js'].includes(project.type);
  const isWeb = ['React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'HTML'].includes(project.type);

  const sourceFiles = await glob('**/*.{js,ts,jsx,tsx,mjs,cjs}', { cwd: dir, ignore: IGNORE });

  // Check for error boundary (React projects)
  if (isReact) {
    let hasErrorBoundary = false;
    for (const file of sourceFiles) {
      let content: string;
      try {
        content = await readFile(join(dir, file), 'utf8');
      } catch { continue; }
      if (/ErrorBoundary|componentDidCatch|getDerivedStateFromError|error-boundary/i.test(content)) {
        hasErrorBoundary = true;
        break;
      }
    }
    if (!hasErrorBoundary) {
      issues.push({
        severity: 'HIGH',
        category: 'Production',
        title: 'No error boundary component',
        detail: 'React app has no ErrorBoundary — crashes will show a blank screen',
      });
    }
  }

  // Check for loading states
  if (isWeb) {
    let hasLoadingState = false;
    for (const file of sourceFiles) {
      let content: string;
      try {
        content = await readFile(join(dir, file), 'utf8');
      } catch { continue; }
      if (/isLoading|loading|Skeleton|Spinner|Loader|suspense|fallback/i.test(content)) {
        hasLoadingState = true;
        break;
      }
    }
    if (!hasLoadingState) {
      issues.push({
        severity: 'HIGH',
        category: 'Production',
        title: 'No loading states detected',
        detail: 'No isLoading/loading/Spinner patterns found — users will see nothing while data loads',
      });
    }
  }

  // Check for 404/error page
  if (isWeb) {
    let has404 = false;
    const allFiles = await glob('**/*', { cwd: dir, ignore: IGNORE });
    for (const file of allFiles) {
      if (/404|not-found|notfound|error\.(jsx?|tsx?|html|vue|svelte)$/i.test(file)) {
        has404 = true;
        break;
      }
    }
    if (!has404) {
      for (const file of sourceFiles) {
        let content: string;
        try {
          content = await readFile(join(dir, file), 'utf8');
        } catch { continue; }
        if (/404|Not Found|notFound/i.test(content) && /page|route|component/i.test(file)) {
          has404 = true;
          break;
        }
      }
    }
    if (!has404) {
      issues.push({
        severity: 'HIGH',
        category: 'Production',
        title: 'No 404/error page',
        detail: 'Missing a custom 404 page — users hitting bad URLs will see an ugly default',
      });
    }
  }

  // Check .gitignore
  let gitignoreContent = '';
  try {
    gitignoreContent = await readFile(join(dir, '.gitignore'), 'utf8');
  } catch {
    issues.push({
      severity: 'HIGH',
      category: 'Production',
      title: 'Missing .gitignore',
      detail: 'No .gitignore file found — node_modules and other junk may be committed',
    });
  }

  // Check node_modules in .gitignore
  if (gitignoreContent && !gitignoreContent.split('\n').some(l => l.trim() === 'node_modules' || l.trim() === 'node_modules/')) {
    issues.push({
      severity: 'HIGH',
      category: 'Production',
      title: 'node_modules not in .gitignore',
      detail: 'node_modules/ should always be gitignored',
    });
  }

  // Check for build script
  if (pkg && !pkg.scripts?.build) {
    issues.push({
      severity: 'HIGH',
      category: 'Production',
      title: 'No build script in package.json',
      detail: 'No "build" script found — how will this be deployed?',
    });
  }

  // Check process.env without fallback
  const envNoFallback: string[] = [];
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(join(dir, file), 'utf8');
    } catch { continue; }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/process\.env\.\w+/.test(line)) {
        // Check if there's a fallback (|| or ?? or ternary or validation)
        if (!/\|\||&&|\?\?|\?.*:/.test(line) && !/assert|throw|required|validate|zod|joi/i.test(line)) {
          envNoFallback.push(`${file}:${i + 1}`);
        }
      }
    }
  }

  if (envNoFallback.length > 0) {
    const preview = envNoFallback.slice(0, 5).join(', ');
    const extra = envNoFallback.length > 5 ? `, ... (${envNoFallback.length} total)` : '';
    issues.push({
      severity: 'HIGH',
      category: 'Production',
      title: `${envNoFallback.length} process.env usage${envNoFallback.length === 1 ? '' : 's'} without fallback`,
      detail: `No default value or validation — ${preview}${extra}`,
    });
  }

  // Check for CI/CD config
  let hasCiCd = false;
  const ciPaths = [
    '.github/workflows',
    '.gitlab-ci.yml',
    '.circleci',
    'Jenkinsfile',
    '.travis.yml',
    'bitbucket-pipelines.yml',
    'azure-pipelines.yml',
    '.drone.yml',
  ];
  for (const ciPath of ciPaths) {
    try {
      await stat(join(dir, ciPath));
      hasCiCd = true;
      break;
    } catch {}
  }
  if (!hasCiCd) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Production',
      title: 'No CI/CD configuration found',
      detail: 'No .github/workflows/, .gitlab-ci.yml, or similar — set up automated testing and deployment',
    });
  }

  // Check for README
  let hasReadme = false;
  const readmePatterns = ['README.md', 'README', 'readme.md', 'Readme.md', 'README.txt'];
  for (const name of readmePatterns) {
    try {
      await access(join(dir, name));
      hasReadme = true;
      break;
    } catch {}
  }
  if (!hasReadme) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Production',
      title: 'No README found',
      detail: 'Every project needs a README — how will anyone know what this does?',
    });
  }

  // Check for test files
  const testFiles = await glob('**/*.{test,spec}.{js,ts,jsx,tsx,mjs,cjs}', { cwd: dir, ignore: IGNORE });
  const testDirs = await glob('**/__tests__/**/*.{js,ts,jsx,tsx}', { cwd: dir, ignore: IGNORE });
  if (testFiles.length === 0 && testDirs.length === 0) {
    issues.push({
      severity: 'HIGH',
      category: 'Production',
      title: 'No tests found',
      detail: 'No *.test.*, *.spec.*, or __tests__/ files — you are deploying without a safety net',
    });
  }

  // Bundle size check — flag if too many dependencies
  if (pkg) {
    const depCount = Object.keys(pkg.dependencies || {}).length;
    if (depCount > 30) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Production',
        title: `${depCount} production dependencies`,
        detail: `package.json has ${depCount} dependencies (>30) — review if all are needed, bundle size may be bloated`,
      });
    }
  }

  // Check for start or dev script
  if (pkg && !pkg.scripts?.start && !pkg.scripts?.dev) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Production',
      title: 'No start or dev script in package.json',
      detail: 'Add a "start" or "dev" script so the project can be run easily',
    });
  }

  return issues;
}
