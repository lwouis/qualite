import {ChildProcessAndFileName, messageForOneFile, messageForSummary, Verbosity} from './qualite';
import chalk from 'chalk';
import {List} from 'immutable';
import {ProcessCode} from './utils';

describe('messageForOneFile', () => {
  test('stdout is empty', () =>
    expect(messageForOneFile('file1', '', 0, Verbosity.LogEverything)).toBe(mockGreenLog(`
  ✓ file1`)));

  test('stdout is single line', () =>
    expect(messageForOneFile('file1', 'line1', 0, Verbosity.LogEverything)).toBe(mockGreenLog(`
  ✓ file1
line1`)));

  test('stdout is 3 lines', () =>
    expect(messageForOneFile('file1', 'line1\nline2\nline3', 0, Verbosity.LogEverything)).toBe(mockGreenLog(`
  ✓ file1
line1
line2
line3`)));

  test('code is 1', () =>
    expect(messageForOneFile('file1', 'line1', 1, Verbosity.LogEverything)).toBe(mockRedLog(`
  ✗ file1 (exit code: 1)
line1`)));

  test('code is 0 and Verbosity is LogErrors', () =>
    expect(messageForOneFile('file1', 'line1', 0, Verbosity.LogErrors)).toBe(mockGreenLog(`
  ✓ file1`)));
});

describe('messageForSummary', () => {
  test('1 file', () =>
    expect(messageForSummary(List().push(mockFile(0)), Verbosity.LogEverything)).toBe(mockGreenLog(`

Summary: 1/1 succeeded`)));

  test('3 files', () =>
    expect(messageForSummary(List().push(mockFile(0), mockFile(0), mockFile(0)), Verbosity.LogEverything)).toBe(mockGreenLog(`

Summary: 3/3 succeeded`)));
});

function mockLog(s: string, c: 'green' | 'red'): string {
  return chalk[c](s.substring(1));
}

function mockGreenLog(s: string): string {
  return mockLog(s, 'green');
}

function mockRedLog(s: string): string {
  return mockLog(s, 'red');
}

function mockFile(c: ProcessCode): ChildProcessAndFileName {
  return {code: c, stdout: 'line1', stderr: '', filename: 'file1'};
}
