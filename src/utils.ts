import {defer, Observable} from 'rxjs';
import {exec} from 'child_process';

export type ProcessCode = number & {readonly __unique?: unique symbol};
export type StdOut = string & {readonly __unique?: unique symbol};
export type StdErr = string & {readonly __unique?: unique symbol};
export type ShellCommand = string & {readonly __unique?: unique symbol};

export class ChildProcess {
  constructor(
    public code: ProcessCode,
    public stdout: StdOut,
    public stderr: StdErr,
    public error?: Error,
  ) {}

  toString(): string {
    return JSON.stringify(this, null, 2);
  }
}

export function exec$(process: ShellCommand): Observable<ChildProcess> {
  return defer(() => new Promise((ok, ko) =>
    exec(process, {maxBuffer: 1024 * 1024 * 1024}, (error: any, stdout, stderr) => {
      if (error) {
        ko(new ChildProcess(error.code, stdout.trim(), stderr.trim(), error));
      } else {
        ok(new ChildProcess(0, stdout.trim(), stderr.trim()));
      }
    }),
  ));
}
