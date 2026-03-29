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

export function calcScore(issues: Issue[]): number {
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

interface CompareProject {
  name: string;
  issues: Issue[];
  score: number;
  verdict: string;
}

export function displayComparison(project1: CompareProject, project2: CompareProject): void {
  const COL = 24;
  const pad = (s: string, len: number) => s + ' '.repeat(Math.max(0, len - s.length));

  console.log();
  console.log(chalk.dim(LINE));
  console.log(chalk.bold('  UNFUCK') + chalk.dim('  --compare'));
  console.log(chalk.dim(LINE));
  console.log();

  // Project names
  console.log(`  ${pad('', COL)}${chalk.dim(pad('Project A', COL))}${chalk.dim('Project B')}`);
  console.log(`  ${pad('Name', COL)}${chalk.bold(pad(project1.name, COL))}${chalk.bold(project2.name)}`);
  console.log();

  // Scores with color-coded bars
  const bar = (score: number): string => {
    const filled = Math.round(score / 5);
    const empty = 20 - filled;
    const color = verdictColor(score);
    return color('\u2588'.repeat(filled)) + chalk.dim('\u2591'.repeat(empty));
  };

  console.log(`  ${pad('Score', COL)}${pad(`${bar(project1.score)} ${project1.score}/100`, COL + 22)}${bar(project2.score)} ${project2.score}/100`);
  console.log();

  // Issue counts by severity
  console.log(chalk.dim(`  ${pad('Issues by severity', COL)}${pad('A', COL)}B`));
  for (const sev of SEVERITY_ORDER) {
    const color = SEVERITY_COLORS[sev];
    const c1 = project1.issues.filter(i => i.severity === sev).length;
    const c2 = project2.issues.filter(i => i.severity === sev).length;
    const icon = SEVERITY_ICONS[sev];
    const label = sev.toLowerCase();
    const highlight = (count: number, other: number) => {
      if (count === other) return String(count);
      return count < other ? chalk.green(String(count)) : chalk.red(String(count));
    };
    console.log(`  ${icon} ${color(pad(label, COL - 4))}${pad(highlight(c1, c2), COL)}${highlight(c2, c1)}`);
  }
  const total1 = project1.issues.length;
  const total2 = project2.issues.length;
  console.log(`  ${pad('  Total', COL)}${pad(String(total1), COL)}${total2}`);
  console.log();

  // Verdicts
  const vc1 = verdictColor(project1.score);
  const vc2 = verdictColor(project2.score);
  console.log(`  ${pad('Verdict', COL)}${vc1.bold(pad(project1.verdict, COL))}${vc2.bold(project2.verdict)}`);
  console.log();

  // Winner
  console.log(chalk.dim(LINE));
  console.log();
  if (project1.score > project2.score) {
    console.log(`  ${chalk.green.bold('\u{1F3C6} Winner:')} ${chalk.bold(project1.name)} (by ${project1.score - project2.score} points)`);
  } else if (project2.score > project1.score) {
    console.log(`  ${chalk.green.bold('\u{1F3C6} Winner:')} ${chalk.bold(project2.name)} (by ${project2.score - project1.score} points)`);
  } else {
    console.log(`  ${chalk.yellow.bold("It's a tie!")} Both projects scored ${project1.score}/100`);
  }
  console.log();
  console.log(chalk.dim(LINE));
  console.log();
}

export function displayComparisonJson(project1: CompareProject, project2: CompareProject): void {
  const make = (p: CompareProject) => ({
    name: p.name,
    score: p.score,
    verdict: p.verdict,
    issues: p.issues.length,
    critical: p.issues.filter(i => i.severity === 'CRITICAL').length,
    high: p.issues.filter(i => i.severity === 'HIGH').length,
    medium: p.issues.filter(i => i.severity === 'MEDIUM').length,
    low: p.issues.filter(i => i.severity === 'LOW').length,
  });
  const winner = project1.score > project2.score ? project1.name
    : project2.score > project1.score ? project2.name
    : 'tie';
  console.log(JSON.stringify({ project1: make(project1), project2: make(project2), winner }, null, 2));
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
