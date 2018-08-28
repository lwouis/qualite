import chalk from 'chalk';
import {cpus} from 'os';
import {Map, Set} from 'immutable';
import * as pino from 'pino';
import {catchError, flatMap, map, mergeMap, reduce} from 'rxjs/operators';
import {defer, forkJoin, from, Observable, of} from 'rxjs';
import {execP, ProcessCode, StdOut} from './utils';
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

function runProcessForEachFile(p: ProcessToRun, f: Files, wl: PatternWhitelist, bl: PatternBlacklist, m: MaxParallel, v: Verbosity): void {
  const l = createLogger(v);
  processFiles(filesToRunOn(f, wl, bl), p, m, l, v)
    .subscribe(a => {
      l.info('exit with code ' + a);
      process.exit(a);
    });
}

function processFiles(f: Observable<FilesToProcess>, p: ProcessToRun, m: MaxParallel, l: pino.Logger, v: Verbosity): Observable<ProcessCode> {
  return f.pipe(
    flatMap(a => {
      if (a.count() === 0) {
        l.info(resultMessage('No file to process', '', true, v));
        return of(0);
      }
      return runInBatches(a, p, m, l, v);
    }),
    reduce((acc, e) => e !== 0 ? e : acc),
  );
}

function runInBatches(f: FilesToProcess, p: ProcessToRun, m: MaxParallel, l: pino.Logger, v: Verbosity): Observable<ProcessCode> {
  return from(f.toArray()).pipe(mergeMap(a => defer(() => execProcess(p, a, l, v)), m));
}

function execProcess(p: ProcessToRun, f: FileName, l: pino.Logger, v: Verbosity): Observable<ProcessCode> {
  return execP(`${p} ${f} 2>&1`)
    .pipe(
      map(a => {
        l.info(resultMessage(f, a.stdout, a.code === 0, v));
        return a.code;
      }),
      catchError(a => {
        l.info(resultMessage(f, a.stdout, a.code === 0, v));
        return of(a.code);
      }),
    );
}

function resultMessage(f: FileName, std: StdOut, s: Success, v: Verbosity): string {
  const color = s ? 'green' : 'red';
  const symbol = s ? '✓' : '✗';
  const stdOut = !s || v === Verbosity.LogEverything ? '\n' + std : '';
  return chalk[color](`  ${symbol} ${f}`) + stdOut;
}

function targetBranch(): string {
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

function linesFromStdout(a: StdOut): FilesToProcess {
  return Set<string>(a.split(/\r?\n/));
}

function modifiedSinceOriginMasterInGit(): Observable<FilesToProcess> {
  return forkJoin([
    execP(`git --no-pager diff --name-only --diff-filter=AM ${targetBranch()}...HEAD`),
    execP('git --no-pager diff --name-only --diff-filter=AM --staged'),
  ]).pipe(map(([a, b]) => linesFromStdout(a.stdout + b.stdout)));
}

function indexedInGit(): Observable<FilesToProcess> {
  return execP('git ls-files').pipe(map(a => linesFromStdout(a.stdout)));
}

function allInPwd(): Observable<FilesToProcess> {
  return from(recursive(process.cwd()).then(f => Set<string>(f)));
}

function stagedInGit(): Observable<FilesToProcess> {
  return execP('git --no-pager diff --name-only --diff-filter=AM --staged').pipe(map(a => linesFromStdout(a.stdout)));
}

function _filesToRunOn(f: Files): Observable<FilesToProcess> {
  return Map<Files, () => Observable<FilesToProcess>>()
    .set(Files.AllInPwd, allInPwd)
    .set(Files.IndexedInGit, indexedInGit)
    .set(Files.ModifiedSinceOriginMasterInGit, modifiedSinceOriginMasterInGit)
    .set(Files.StagedInGit, stagedInGit)
    .get(f)();
}

function filesToRunOn(fi: Files, wl: PatternWhitelist, bl: PatternBlacklist): Observable<FilesToProcess> {
  return _filesToRunOn(fi)
    .pipe(
      map(files => wl.size > 0 ? files.filter(f => wl.some(wlp => wlp.test(f))) : files),
      map(files => bl.size > 0 ? files.filter(f => bl.every(blp => !blp.test(f))) : files),
      map(files => files.sort()),
    );
}

function createLogger(v: Verbosity): pino.Logger {
  return pino({
    prettyPrint: {
      formatter: line => line.msg,
    },
    enabled: v !== Verbosity.Silent,
  });
}

type ProcessToRun = string & {readonly __unique?: unique symbol};
type FileName = string & {readonly __unique?: unique symbol};
type Success = boolean & {readonly __unique?: unique symbol};
type MaxParallel = number & {readonly __unique?: unique symbol};
type PatternWhitelist = Set<RegExp> & {readonly __unique?: unique symbol};
type PatternBlacklist = Set<RegExp> & {readonly __unique?: unique symbol};
type FilesToProcess = Set<string> & {readonly __unique?: unique symbol};
