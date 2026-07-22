'use strict';

/**
 * calculator-core/index.js — directory-resolvable TEST ENTRY POINT.
 *
 * WHY THIS FILE EXISTS (resolves review finding F3)
 * -------------------------------------------------
 * The checkpoint mandates that the exact command
 *
 *     node --test calculator-core/
 *
 * runs the full calculator-core test suite and exits 0. On the project's
 * runtime (Node.js v22.x) the built-in test runner does NOT treat a bare
 * directory argument as a test-discovery root; instead Node performs a
 * DIRECTORY REQUIRE of `calculator-core/`, which resolves via this package's
 * `package.json` "main" (set to "index.js") to THIS file. By re-exporting —
 * i.e. `require()`-ing — every `*.test.js` module from here, loading this one
 * entry point registers all of their `node:test` cases, so the mandated
 * directory command executes the entire suite (all nine test modules) and
 * exits 0.
 *
 * Running `node --test` from the repository root is unaffected: Node's default
 * test-file globs match only `*.test.js` style files, and `index.js` matches
 * none of them, so the root command still auto-discovers exactly the nine test
 * modules once (this aggregator is never double-counted).
 *
 * ZERO-DEPENDENCY POSTURE (constraint C-001)
 * ------------------------------------------
 * This file imports ONLY local sibling test modules via relative `require()`.
 * It pulls in no npm package, no bundler, and no runtime dependency — it simply
 * aggregates the existing built-in-runner suites. It performs NO work of its
 * own beyond wiring the suites together.
 *
 * KEEP IN SYNC: this list must name every `*.test.js` file under
 * calculator-core/ (the two core suites plus the seven math-engine suites).
 */

// calculator-core suites.
require('./calculator.test.js');
require('./history.test.js');

// math-engine suites (one per operation).
require('./math-engine/add.test.js');
require('./math-engine/subtract.test.js');
require('./math-engine/multiply.test.js');
require('./math-engine/divide.test.js');
require('./math-engine/modulus.test.js');
require('./math-engine/power.test.js');
require('./math-engine/sqrt.test.js');
