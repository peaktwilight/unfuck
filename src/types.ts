export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Issue {
  severity: Severity;
  category: string;
  title: string;
  detail: string;
}

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  type?: string;
  bin?: Record<string, string>;
  license?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface ProjectInfo {
  name: string;
  type: string;
  pkg: PackageJson | null;
  files: string[];
  dir: string;
}
