#!/usr/bin/env node

import { resolve } from 'path';
import ora from 'ora';
import { detectProject } from './detect.js';
import { runSecurityChecks } from './checks/security.js';
import { runSeoChecks } from './checks/seo.js';
import { runDepsChecks } from './checks/deps.js';
import { runQualityChecks } from './checks/quality.js';
import { runProductionChecks } from './checks/production.js';
import { displayReport, displayJson } from './display.js';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const targetDir = resolve(args.find(a => !a.startsWith('--')) || '.');

async function main(): Promise<void> {
  const spinner = jsonMode ? null : ora('Scanning project...').start();

  try {
    const project = await detectProject(targetDir);
    if (spinner) spinner.text = `Detected ${project.type} project. Running checks...`;

    const [security, seo, deps, quality, production] = await Promise.all([
      runSecurityChecks(targetDir, project),
      runSeoChecks(targetDir, project),
      runDepsChecks(targetDir, project),
      runQualityChecks(targetDir, project),
      runProductionChecks(targetDir, project),
    ]);

    const issues = [...security, ...seo, ...deps, ...quality, ...production];

    if (spinner) spinner.stop();

    if (jsonMode) {
      displayJson(project, issues);
    } else {
      displayReport(project, issues);
    }

    const hasCritical = issues.some(i => i.severity === 'CRITICAL');
    process.exit(hasCritical ? 1 : 0);
  } catch (err) {
    if (spinner) spinner.fail('Scan failed');
    console.error((err as Error).message);
    process.exit(2);
  }
}

main();
