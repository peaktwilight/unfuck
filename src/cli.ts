#!/usr/bin/env node

import { resolve } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { detectProject, filterProjectFiles } from './detect.js';
import { getChangedFiles } from './diff.js';
import { runSecurityChecks } from './checks/security.js';
import { runSeoChecks } from './checks/seo.js';
import { runDepsChecks } from './checks/deps.js';
import { runQualityChecks } from './checks/quality.js';
import { runProductionChecks } from './checks/production.js';
import { displayReport, displayJson, displayComparison, displayComparisonJson, calcScore } from './display.js';
import { autoFix } from './fix.js';
import { loadConfig, applyConfig, writeDefaultConfig } from './config.js';
import type { Issue, ProjectInfo } from './types.js';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const badgeMode = args.includes('--badge');
const fixMode = args.includes('--fix');
const watchMode = args.includes('--watch');
const diffMode = args.includes('--diff');
const initMode = args.includes('--init');
const compareMode = args.includes('--compare');
const helpMode = args.includes('--help') || args.includes('-h');
const positionalArgs = args.filter(a => !a.startsWith('--'));
const targetDir = resolve(positionalArgs[0] || '.');

async function runScan(dir: string, diff = false): Promise<{ project: ProjectInfo; issues: Issue[] }> {
  let project = await detectProject(dir);
  if (diff) {
    const changed = await getChangedFiles(dir);
    project = filterProjectFiles(project, changed);
  }
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

function getVerdict(score: number): string {
  if (score >= 90) return 'CERTIFIED CLEAN';
  if (score >= 70) return 'MOSTLY GOOD';
  if (score >= 50) return 'NEEDS WORK';
  if (score >= 30) return 'PRETTY ROUGH';
  return 'DUMPSTER FIRE';
}

function showHelp(): void {
  console.log(`
  ${chalk.bold('unfuck')} — fix the last 20% of your vibe-coded project

  ${chalk.bold('Usage:')}
    unfuck [directory] [options]
    unfuck --compare <dir1> <dir2>        Compare two projects side by side

  ${chalk.bold('Options:')}
    --json       Output results as JSON
    --badge      Generate a README badge with your score
    --fix        Auto-fix issues where possible
    --watch      Watch for file changes and re-scan
    --diff       Only check files changed since last commit
    --compare    Compare two projects' scores side by side
    --init       Generate a default .unfckedrc.json config file
    --help, -h   Show this help message

  ${chalk.bold('Configuration:')}
    Create a ${chalk.cyan('.unfckedrc')} or ${chalk.cyan('.unfckedrc.json')} in your project root:

    {
      "ignore": [],             ${chalk.dim('// issue titles to ignore (exact or glob)')}
      "severity": {},           ${chalk.dim('// override severity: { "title": "LOW" }')}
      "disable": [],            ${chalk.dim('// categories to disable: ["seo", "quality"]')}
      "threshold": 50,          ${chalk.dim('// custom pass/fail score threshold')}
      "maxFileSize": 300        ${chalk.dim('// max file line count')}
    }

    Run ${chalk.cyan('unfuck --init')} to generate a starter config.
`);
}

async function main(): Promise<void> {
  if (helpMode) {
    showHelp();
    return;
  }

  if (initMode) {
    const filepath = writeDefaultConfig(targetDir);
    console.log();
    console.log(chalk.green(`  Created ${filepath}`));
    console.log(chalk.dim('  Edit this file to customize unfuck for your project.'));
    console.log();
    return;
  }

  if (compareMode) {
    if (positionalArgs.length < 2) {
      console.error(chalk.red('  Error: --compare requires two project paths'));
      console.error(chalk.dim('  Usage: unfuck --compare /path/to/project1 /path/to/project2'));
      process.exit(1);
    }

    const dir1 = resolve(positionalArgs[0]);
    const dir2 = resolve(positionalArgs[1]);

    const spinner = jsonMode ? null : ora('Scanning both projects...').start();

    try {
      const config1 = loadConfig(dir1);
      const config2 = loadConfig(dir2);

      if (spinner) spinner.text = `Scanning ${dir1}...`;
      const scan1 = await runScan(dir1);
      const issues1 = applyConfig(scan1.issues, config1);

      if (spinner) spinner.text = `Scanning ${dir2}...`;
      const scan2 = await runScan(dir2);
      const issues2 = applyConfig(scan2.issues, config2);

      const score1 = calcScore(issues1);
      const score2 = calcScore(issues2);

      const p1 = { name: scan1.project.name, issues: issues1, score: score1, verdict: getVerdict(score1) };
      const p2 = { name: scan2.project.name, issues: issues2, score: score2, verdict: getVerdict(score2) };

      if (spinner) spinner.stop();

      if (jsonMode) {
        displayComparisonJson(p1, p2);
      } else {
        displayComparison(p1, p2);
      }
    } catch (err) {
      if (spinner) spinner.fail('Comparison failed');
      console.error((err as Error).message);
      process.exit(2);
    }
    return;
  }

  const config = loadConfig(targetDir);

  if (badgeMode) {
    const spinner = ora('Scanning project...').start();
    try {
      const { issues: rawIssues } = await runScan(targetDir, diffMode);
      const issues = applyConfig(rawIssues, config);
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
      const { project, issues: rawIssues } = await runScan(targetDir, diffMode);
      const issues = applyConfig(rawIssues, config);
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
            console.log(chalk.green(`  ✔ Fixed: ${result.message}`));
          } else {
            console.log(chalk.dim(`  ⊘ Skipped: ${result.message}`));
          }
        }
      }
      console.log();

      // Re-scan to get updated score
      const spinner2 = ora('Re-scanning...').start();
      const { project: newProject, issues: newIssues } = await runScan(targetDir, diffMode);
      spinner2.stop();
      const afterScore = calcScore(newIssues);

      displayReport(newProject, newIssues);

      if (afterScore > beforeScore) {
        console.log(chalk.green(`  Score improved: ${beforeScore}/100 → ${afterScore}/100`));
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
    let project = await detectProject(targetDir);
    if (diffMode) {
      const changed = await getChangedFiles(targetDir);
      project = filterProjectFiles(project, changed);
      if (spinner) spinner.text = `Checking ${project.files.length} changed file${project.files.length === 1 ? '' : 's'} (diff mode)...`;
    } else {
      if (spinner) spinner.text = `Detected ${project.type} project. Running checks...`;
    }

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

    if (watchMode) {
      const { watch } = await import('node:fs');
      console.log(chalk.dim('\n  Watching for changes... (Ctrl+C to stop)\n'));

      let timeout: NodeJS.Timeout;
      watch(targetDir, { recursive: true }, (_event, filename) => {
        // Ignore node_modules, .git, and dist directories
        if (filename && (/node_modules|\.git|dist/.test(filename))) return;

        clearTimeout(timeout);
        timeout = setTimeout(async () => {
          console.clear();
          const watchSpinner = ora('Re-scanning project...').start();
          try {
            const { project: p, issues: i } = await runScan(targetDir, diffMode);
            watchSpinner.stop();
            displayReport(p, i);
            console.log(chalk.dim('  Watching for changes... (Ctrl+C to stop)\n'));
          } catch (err) {
            watchSpinner.fail('Re-scan failed');
            console.error((err as Error).message);
          }
        }, 1000);
      });
      return;
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
