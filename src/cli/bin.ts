#!/usr/bin/env node
/**
 * CLI executable entry point — delegates to {@link main} and exits with its code.
 */

import { main } from "./main";

const code = await main(process.argv.slice(2));
process.exit(code);
