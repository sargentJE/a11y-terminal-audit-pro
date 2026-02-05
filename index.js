#!/usr/bin/env node
/**
 * index.js
 * -----------------------------------------------------------------------------
 * CLI entrypoint.
 *
 * The primary orchestration logic lives under cli/ modules so this file remains
 * stable as the public bin entry and lifecycle wrapper.
 */

import { green, red } from 'colorette';

import { Config } from './utils/Config.js';
import { Logger } from './utils/Logger.js';
import { parseArgs } from './cli/parseArgs.js';
import { printHelp } from './cli/helpText.js';
import { runPipeline } from './cli/runPipeline.js';

(async () => {
  const argv = process.argv.slice(2);

  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(red(`\nError: ${err.message}\n`));
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.init) {
    await Config.generateSampleConfig('./.a11yrc.json');
    console.log(green('✔ Generated sample config file: .a11yrc.json'));
    process.exit(0);
  }

  const logger = new Logger({ level: args.verbose ? 'debug' : 'info' });

  let exitCode = 0;
  try {
    exitCode = await runPipeline({ args, logger });
  } catch (err) {
    console.error(red(`\nError: ${err?.message || err}\n`));
    printHelp();
    exitCode = 1;
  }

  process.exit(exitCode);
})();
