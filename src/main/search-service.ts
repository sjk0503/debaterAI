import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

/**
 * 검색 서비스 — grep, 파일 검색, 심볼 검색
 */
export class SearchService {
  /**
   * 텍스트 검색 (grep)
   */
  async grep(
    projectPath: string,
    query: string,
    options: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean; include?: string; maxResults?: number } = {},
  ): Promise<GrepResult[]> {
    const args = ['--recursive', '--line-number', '--with-filename'];

    if (!options.caseSensitive) args.push('--ignore-case');
    if (options.wholeWord) args.push('--word-regexp');
    if (!options.regex) args.push('--fixed-strings');
    if (options.include) args.push(`--include=${options.include}`);

    // 무시할 디렉토리
    args.push(
      '--exclude-dir=node_modules',
      '--exclude-dir=.git',
      '--exclude-dir=dist',
      '--exclude-dir=build',
      '--exclude-dir=.next',
      '--exclude-dir=__pycache__',
      '--exclude-dir=.debaterai-worktrees',
    );

    args.push('--', query, projectPath);

    try {
      const { stdout } = await exec('grep', args, {
        maxBuffer: 5 * 1024 * 1024,
        timeout: 10000,
      });

      const results: GrepResult[] = [];
      const maxResults = options.maxResults || 100;

      for (const line of stdout.split('\n')) {
        if (!line.trim() || results.length >= maxResults) continue;

        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          results.push({
            file: match[1].replace(projectPath + '/', ''),
            line: parseInt(match[2]),
            content: match[3].trim(),
          });
        }
      }

      return results;
    } catch (err: any) {
      // grep returns exit code 1 when no matches found
      if (err.code === 1) return [];
      throw err;
    }
  }

  /**
   * 파일명 검색
   */
  async findFiles(
    projectPath: string,
    query: string,
    options: { maxResults?: number } = {},
  ): Promise<string[]> {
    const args = [
      projectPath,
      '-type', 'f',
      '-iname', `*${query}*`,
      '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
      '-not', '-path', '*/dist/*',
      '-not', '-path', '*/.debaterai-worktrees/*',
    ];

    try {
      const { stdout } = await exec('find', args, {
        maxBuffer: 2 * 1024 * 1024,
        timeout: 5000,
      });

      const maxResults = options.maxResults || 50;
      return stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, maxResults)
        .map((f) => f.replace(projectPath + '/', ''));
    } catch {
      return [];
    }
  }

  /**
   * 프로젝트 통계
   */
  async getProjectStats(projectPath: string): Promise<ProjectStats> {
    const stats: ProjectStats = {
      totalFiles: 0,
      totalLines: 0,
      languages: {},
    };

    try {
      // 파일 수
      const { stdout: fileCount } = await exec('find', [
        projectPath,
        '-type', 'f',
        '-not', '-path', '*/node_modules/*',
        '-not', '-path', '*/.git/*',
        '-not', '-path', '*/dist/*',
      ], { timeout: 5000 });
      stats.totalFiles = fileCount.split('\n').filter(Boolean).length;

      // 언어별 파일 수
      const extMap: Record<string, string> = {
        '.ts': 'TypeScript', '.tsx': 'TypeScript React',
        '.js': 'JavaScript', '.jsx': 'JavaScript React',
        '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
        '.css': 'CSS', '.html': 'HTML', '.json': 'JSON',
        '.md': 'Markdown', '.vue': 'Vue', '.svelte': 'Svelte',
      };

      for (const file of fileCount.split('\n').filter(Boolean)) {
        const ext = file.match(/\.[^.]+$/)?.[0] || '';
        const lang = extMap[ext];
        if (lang) {
          stats.languages[lang] = (stats.languages[lang] || 0) + 1;
        }
      }

      // 총 라인 수 (소스 파일만)
      try {
        const { stdout: lineCount } = await exec('sh', ['-c',
          `find "${projectPath}" -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.css" \\) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | xargs wc -l 2>/dev/null | tail -1`
        ], { timeout: 10000 });
        const totalMatch = lineCount.trim().match(/(\d+)\s+total/);
        if (totalMatch) stats.totalLines = parseInt(totalMatch[1]);
      } catch {}
    } catch {}

    return stats;
  }
}

export interface GrepResult {
  file: string;
  line: number;
  content: string;
}

export interface ProjectStats {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
}
