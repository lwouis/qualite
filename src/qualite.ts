import chalk from 'chalk';
import {cpus} from 'os';
import {List, Map, Set} from 'immutable';
import * as pino from 'pino';
import {catchError, map, mergeMap, reduce} from 'rxjs/operators';
import {defer, forkJoin, from, Observable, of} from 'rxjs';
import {ChildProcess, exec$, ProcessCode, StdOut} from './utils';
import * as recursive from 'recursive-readdir';

/**
 * Qualite runs a given process on a selection of files. Typical use is to run a quality tool such as a formatter of linter on all the project files during CI.
 *
 * @param processToRun process to run on each file
 * @param filesToProcess how the files to process are selected
 * @param patternWhitelist the files not matching these patterns will be ignored
 * @param patternBlacklist the files matching these patterns will be ignored
 * @param verbosity verbosity of this program's stdout logs
 * @param maxParallel maximum number of processes running in parallel at a given time
 */
export function qualite(
  processToRun: string,
  filesToProcess: Files = Files.StagedInGit,
  patternWhitelist: RegExp[] = [],
  patternBlacklist: RegExp[] = [],
  verbosity: Verbosity = Verbosity.LogErrors,
  maxParallel: number = cpus().length,
): void {
  return runProcessForEachFile(
    processToRun,
    filesToProcess,
    Set<RegExp>(patternWhitelist),
    Set<RegExp>(patternBlacklist),
    maxParallel,
    verbosity,
  );
}

export enum Verbosity {
  Silent,
  LogErrors,
  LogEverything,
}

export enum Files {
  AllInPwd,
  IndexedInGit,
  ModifiedSinceOriginMasterInGit,
  StagedInGit,
}

export function runProcessForEachFile(p: ProcessToRun, f: Files, wl: PatternWhitelist, bl: PatternBlacklist, m: MaxParallel, v: Verbosity): void {
  const l = createLogger(v);
  filesToRunOn(f, wl, bl).subscribe(files => {
    if (files.size === 0) {
      nothingToRun(l);
    } else {
      runAll(files, p, m, l, v);
    }
  });
}

export function runAll(f: FilesToProcess, p: ProcessToRun, m: MaxParallel, l: pino.Logger, v: Verbosity): void {
  l.info(messageForHeader(f));
  runInParallel(f, p, m).pipe(
    reduce((acc, e: ChildProcessAndFileName) => {
      l.info(messageForOneFile(e.filename, e.stdout, e.code, v));
      return acc.push(e);
    }, List<ChildProcessAndFileName>()),
  ).subscribe(a => {
    l.info(messageForSummary(a, v));
    process.exit(a.some(b => b.code !== 0) ? 1 : 0);
  });
}

export function runInParallel(f: FilesToProcess, p: ProcessToRun, m: MaxParallel): Observable<ChildProcessAndFileName> {
  return from(f.toArray()).pipe(mergeMap(a => defer(() => execProcess(p, a)), m));
}

export function nothingToRun(l: pino.Logger): void {
  l.info('No file to process');
  process.exit(0);
}

export function execProcess(p: ProcessToRun, f: FileName): Observable<ChildProcessAndFileName> {
  return exec$(`${p} ${f} 2>&1`)
    .pipe(
      catchError(a => of(a)),
      map(a => Object.assign(a, {filename: f})),
    );
}

export function messageForOneFile(f: FileName, s: StdOut, p: ProcessCode, v: Verbosity): MessageToLog {
  const success = p === 0;
  const color = success ? 'green' : 'red';
  const symbol = success ? '✓' : '✗';
  const shouldLog = !success || v === Verbosity.LogEverything;
  const stdOut = shouldLog && s !== '' ? `\n${s}` : '';
  const exitCode = success ? '' : ` (exit code: ${p})`;
  return chalk[color](`  ${symbol} ${f}${exitCode}${stdOut}`);
}

export function messageForSummary(p: List<ChildProcessAndFileName>, v: Verbosity): MessageToLog {
  const failures = p.filter(a => a.code !== 0);
  const summary = '\nSummary: ';
  if (failures.size === 0) {
    return chalk['green'](`${summary}${p.size}/${p.size} succeeded`);
  } else {
    const failureLines = failures.reduce((acc, e) => acc + messageForOneFile(e.filename, e.stdout, e.code, v) + '\n', '');
    return chalk['red'](`${summary}${failures.size}/${p.size} failed\n\n${failureLines}`);
  }
}

export function messageForHeader(f: FilesToProcess): MessageToLog {
  const plural = f.size > 1 ? 's' : '';
  return `${f.size} file${plural} to process:\n`;
}

export function targetBranch(): GitBranch {
  if (process.env.STASH_PULL_REQUEST_BRANCH_DESTINATION) {
    // SW2
    return 'stash/' + process.env.STASH_PULL_REQUEST_BRANCH_DESTINATION;
  }
  if (process.env.CHANGE_TARGET) {
    // SF
    return 'upstream/' + process.env.CHANGE_TARGET;
  }
  // local
  return 'origin/master';
}

export function linesFromStdout(a: StdOut): FilesToProcess {
  if (a === '') {
    return Set<string>();
  }
  return Set<string>(a.split(/\r?\n/));
}

export function modifiedSinceOriginMasterInGit(): Observable<FilesToProcess> {
  return forkJoin([
    exec$(`git --no-pager diff --name-only --diff-filter=AM ${targetBranch()}...HEAD`),
    exec$('git --no-pager diff --name-only --diff-filter=AM --staged'),
  ]).pipe(map(([a, b]) => linesFromStdout(a.stdout + b.stdout)));
}

export function indexedInGit(): Observable<FilesToProcess> {
  return exec$('git ls-files').pipe(map(a => linesFromStdout(a.stdout)));
}

export function allInPwd(): Observable<FilesToProcess> {
  return from(recursive(process.cwd()).then(f => Set<string>(f)));
}

export function stagedInGit(): Observable<FilesToProcess> {
  return exec$('git --no-pager diff --name-only --diff-filter=AM --staged').pipe(map(a => linesFromStdout(a.stdout)));
}

export function _filesToRunOn(f: Files): Observable<FilesToProcess> {
  return Map<Files, () => Observable<FilesToProcess>>()
    .set(Files.AllInPwd, allInPwd)
    .set(Files.IndexedInGit, indexedInGit)
    .set(Files.ModifiedSinceOriginMasterInGit, modifiedSinceOriginMasterInGit)
    .set(Files.StagedInGit, stagedInGit)
    .get(f)();
}

export function filesToRunOn(fi: Files, wl: PatternWhitelist, bl: PatternBlacklist): Observable<FilesToProcess> {
  return _filesToRunOn(fi)
    .pipe(
      map(files => wl.size > 0 ? files.filter(f => wl.some(wlp => wlp.test(f))) : files),
      map(files => bl.size > 0 ? files.filter(f => bl.every(blp => !blp.test(f))) : files),
      map(files => files.sort()),
    );
}

export function createLogger(v: Verbosity): pino.Logger {
  return pino({
    prettyPrint: {
      formatter: line => line.msg,
    },
    enabled: v !== Verbosity.Silent,
  });
}

export type ProcessToRun = string & {readonly __unique?: unique symbol};
export type MessageToLog = string & {readonly __unique?: unique symbol};
export type GitBranch = string & {readonly __unique?: unique symbol};
export type FileName = string & {readonly __unique?: unique symbol};
export type MaxParallel = number & {readonly __unique?: unique symbol};
export type PatternWhitelist = Set<RegExp> & {readonly __unique?: unique symbol};
export type PatternBlacklist = Set<RegExp> & {readonly __unique?: unique symbol};
export type FilesToProcess = Set<string> & {readonly __unique?: unique symbol};
export type ChildProcessAndFileName = ChildProcess & {filename: FileName};
