import chalk, { type ChalkInstance } from 'chalk';
import type { Severity, Issue, ProjectInfo } from './types.js';

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEVERITY_COLORS: Record<Severity, ChalkInstance> = {
  CRITICAL: chalk.red,
  HIGH: chalk.hex('#FF8C00'),
  MEDIUM: chalk.yellow,
  LOW: chalk.blue,
};
const SEVERITY_ICONS: Record<Severity, string> = {
  CRITICAL: '\u{1F534}',
  HIGH: '\u{1F7E0}',
  MEDIUM: '\u{1F7E1}',
  LOW: '\u{1F535}',
};
const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: 'CRITICAL (fix these NOW)',
  HIGH: 'HIGH (fix before deploying)',
  MEDIUM: 'MEDIUM (should fix soon)',
  LOW: 'LOW (nice to have)',
};

function calcScore(issues: Issue[]): number {
  const penalties: Record<Severity, number> = { CRITICAL: 20, HIGH: 10, MEDIUM: 5, LOW: 2 };
  let score = 100;
  for (const issue of issues) {
    score -= penalties[issue.severity] || 0;
  }
  return Math.max(0, Math.min(100, score));
}

function getVerdict(score: number): string {
  if (score >= 90) return 'CERTIFIED CLEAN';
  if (score >= 70) return 'MOSTLY GOOD';
  if (score >= 50) return 'NEEDS WORK';
  if (score >= 30) return 'PRETTY ROUGH';
  return 'DUMPSTER FIRE';
}

function verdictColor(score: number): ChalkInstance {
  if (score >= 90) return chalk.green;
  if (score >= 70) return chalk.hex('#90EE90');
  if (score >= 50) return chalk.yellow;
  if (score >= 30) return chalk.hex('#FF8C00');
  return chalk.red;
}

const LINE = '\u2500'.repeat(54);

export function displayReport(project: ProjectInfo, issues: Issue[]): void {
  console.log();
  console.log(chalk.dim(LINE));
  console.log(chalk.bold('  UNFUCK') + chalk.dim('  \u2014  fix the last 20% of your vibe-coded project'));
  console.log(chalk.dim(LINE));
  console.log();
  console.log(`  Project: ${chalk.bold(project.name)} (${project.type})`);
  console.log(`  Files scanned: ${project.files.length}`);

  if (issues.length === 0) {
    console.log();
    console.log(chalk.dim(LINE));
    console.log();
    console.log(chalk.green.bold('  No issues found! Your project looks great.'));
    console.log();
    console.log(chalk.dim(LINE));
    console.log();
    const score = 100;
    console.log(`  SCORE: ${chalk.bold(score + '/100')}  \u2014  ${chalk.green.bold('CERTIFIED CLEAN')}`);
    console.log();
    console.log(chalk.dim(LINE));
    console.log();
    return;
  }

  // Group by severity
  let issueNum = 1;
  for (const severity of SEVERITY_ORDER) {
    const group = issues.filter(i => i.severity === severity);
    if (group.length === 0) continue;

    console.log();
    console.log(chalk.dim(LINE));
    console.log();
    const color = SEVERITY_COLORS[severity];
    console.log(`  ${SEVERITY_ICONS[severity]} ${color.bold(SEVERITY_LABELS[severity])}`);
    console.log();

    for (const issue of group) {
      console.log(`  ${chalk.dim(issueNum + '.')} ${chalk.bold(issue.title)}`);
      console.log(`     ${chalk.dim(issue.detail)}`);
      console.log();
      issueNum++;
    }
  }

  console.log(chalk.dim(LINE));
  console.log();

  const score = calcScore(issues);
  const verdict = getVerdict(score);
  const vColor = verdictColor(score);
  console.log(`  SCORE: ${chalk.bold(score + '/100')}  \u2014  ${vColor.bold(verdict)}`);
  console.log();

  const counts: Partial<Record<Severity, number>> = {};
  for (const s of SEVERITY_ORDER) {
    const c = issues.filter(i => i.severity === s).length;
    if (c > 0) counts[s] = c;
  }
  const summary = Object.entries(counts)
    .map(([s, c]) => `${c} ${s.toLowerCase()}`)
    .join(', ');
  console.log(`  Found ${issues.length} issue${issues.length === 1 ? '' : 's'}: ${summary}`);
  console.log();
  console.log(chalk.dim(LINE));
  console.log();
}

export function displayJson(project: ProjectInfo, issues: Issue[]): void {
  const score = calcScore(issues);
  const output = {
    project: { name: project.name, type: project.type, filesScanned: project.files.length },
    score,
    verdict: getVerdict(score),
    issues: issues.map((issue, i) => ({ ...issue, number: i + 1 })),
    summary: {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'CRITICAL').length,
      high: issues.filter(i => i.severity === 'HIGH').length,
      medium: issues.filter(i => i.severity === 'MEDIUM').length,
      low: issues.filter(i => i.severity === 'LOW').length,
    },
  };
  console.log(JSON.stringify(output, null, 2));
}
