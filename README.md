# Purpose

Qualite runs a given process on a list of files. Typical use is to run a quality tool such as a formatter of linter on all the project files during CI, or only on git staged files in a pre-commit hook.
 
# Usage

Qualite has no CLI interface. Instead you call it programmatically in TS.

* Make a file which describe your quality steps, like `example.ts`:

  ```typescript
  import {Files, qualite, Verbosity} from 'qualite';
  
  const commands = new Map([
    ['jscpd', () => qualite('jscpd', Files.IndexedInGit, [/\.json$/], [/^pack/])],
    ['tslint', () => qualite('tslint --fix', Files.StagedInGit)],
    ['cppcheck', () => qualite('cppcheck', Files.StagedInGit, [], [], Verbosity.LogEverything)],
  ]);
  
  commands.get(process.argv[2])();
  ```

* You can then add some scripts to your `package.json`:

  ```
  "scripts": {
    "jscpd": "ts-node example.ts jscpd",
    "tslint": "ts-node example.ts tslint",
    "cppcheck": "ts-node example.ts cppcheck"
  }
  ```

# FAQ

## Why no command line interface?

The CLI is not typed, error-prone, and not ergonomic when passing a big list of flags for the white/blacklists. Because it is programmatic, you can also reuse lists, or generate them dynamically.

For these reasons I decided to go with a Typescript interface.
