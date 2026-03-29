#!/usr/bin/env node

import { resolve } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { detectProject } from './detect.js';
import { runSecurityChecks } from './checks/security.js';
import { runSeoChecks } from './checks/seo.js';
import { runDepsChecks } from './checks/deps.js';
import { runQualityChecks } from './checks/quality.js';
import { runProductionChecks } from './checks/production.js';
import { displayReport, displayJson, calcScore } from './display.js';
import { autoFix } from './fix.js';
import type { Issue, ProjectInfo } from './types.js';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const badgeMode = args.includes('--badge');
const fixMode = args.includes('--fix');
const targetDir = resolve(args.find(a => !a.startsWith('--')) || '.');

async function runScan(dir: string): Promise<{ project: ProjectInfo; issues: Issue[] }> {
  const project = await detectProject(dir);
  const [security, seo, deps, quality, production] = await Promise.all([
    runSecurityChecks(dir, project),
    runSeoChecks(dir, project),
    runDepsChecks(dir, project),
    runQualityChecks(dir, project),
    runProductionChecks(dir, project),
  ]);
  const issues = [...security, ...seo, ...deps, ...quality, ...production];
  return { project, issues };
}

function getBadgeColor(score: number): string {
  if (score >= 90) return 'brightgreen';
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  if (score >= 30) return 'orange';
  return 'red';
}

function generateBadge(score: number): string {
  const color = getBadgeColor(score);
  const encodedScore = encodeURIComponent(`${score}/100`);
  return `![unfuck score](https://img.shields.io/badge/unfuck_score-${encodedScore}-${color})`;
}

async function main(): Promise<void> {
  if (badgeMode) {
    const spinner = ora('Scanning project...').start();
    try {
      const { issues } = await runScan(targetDir);
      spinner.stop();
      const score = calcScore(issues);
      const badge = generateBadge(score);
      console.log();
      console.log('Add this to your README.md:');
      console.log();
      console.log(badge);
      console.log();
      console.log(chalk.dim('Re-run `unfuck --badge` after fixing issues to update your score.'));
      console.log();
    } catch (err) {
      spinner.fail('Scan failed');
      console.error((err as Error).message);
      process.exit(2);
    }
    return;
  }

  if (fixMode) {
    const spinner = ora('Scanning project...').start();
    try {
      const { project, issues } = await runScan(targetDir);
      const beforeScore = calcScore(issues);
      spinner.text = 'Applying fixes...';

      const results = await autoFix(issues, targetDir);
      spinner.stop();

      console.log();
      if (results.length === 0) {
        console.log(chalk.dim('  No auto-fixable issues found.'));
      } else {
        for (const result of results) {
          if (result.fixed) {
            console.log(chalk.green(`  \u2714 Fixed: ${result.message}`));
          } else {
            console.log(chalk.dim(`  \u2298 Skipped: ${result.message}`));
          }
        }
      }
      console.log();

      // Re-scan to get updated score
      const spinner2 = ora('Re-scanning...').start();
      const { project: newProject, issues: newIssues } = await runScan(targetDir);
      spinner2.stop();
      const afterScore = calcScore(newIssues);

      displayReport(newProject, newIssues);

      if (afterScore > beforeScore) {
        console.log(chalk.green(`  Score improved: ${beforeScore}/100 \u2192 ${afterScore}/100`));
        console.log();
      }
    } catch (err) {
      spinner.fail('Fix failed');
      console.error((err as Error).message);
      process.exit(2);
    }
    return;
  }

  // Default scan mode
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
