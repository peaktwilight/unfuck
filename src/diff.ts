import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function gitFiles(cwd: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export async function getChangedFiles(cwd: string): Promise<string[]> {
  const [unstaged, staged, untracked] = await Promise.all([
    gitFiles(cwd, ['diff', '--name-only', 'HEAD']),
    gitFiles(cwd, ['diff', '--name-only', '--cached']),
    gitFiles(cwd, ['ls-files', '--others', '--exclude-standard']),
  ]);

  const unique = new Set([...unstaged, ...staged, ...untracked]);
  return [...unique];
}
