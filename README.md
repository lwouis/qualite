# Purpose

Qualite runs a given process on a list of files. Typical use is to run a quality tool such as a formatter of linter on all the project files during CI, or only on git staged files in a pre-commit hook.

# Install

`npm install qualite`

# Usage

Qualite has no CLI interface. Instead you call it programmatically using TS.

* Make a file which describes your quality steps, like `example.ts`:

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
  
* If you really want a one-liner, or you don't want to create the extra file, you can do something like this:

  ```
  "scripts": {
    "jscpd": "ts-node -p \"require('qualite').qualite('jscpd')\"",
  }
  ```

# Changelog

Changelog is available on [Github releases page](https://github.com/lwouis/qualite/releases)

# FAQ

## Why no command line interface?

The CLI is not typed, error-prone, and not ergonomic when passing a big list of flags for the white/blacklists.

For these reasons I decided to go with a Typescript interface. It has type guarantees, and you can reuse lists or generate them dynamically.
