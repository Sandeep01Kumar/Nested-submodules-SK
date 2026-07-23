'use strict';

/**
 * calculator-core/calculator.test.js
 *
 * Unit tests for the operations FACADE (PR 3 · calculator-core).
 * Subject under test: calculator-core/calculator.js — the unified
 * `calculate(operator, ...operands)` dispatch, its structured error contract
 * (constraint C-004), and its automatic calculation-history recording.
 *
 * Zero-dependency posture (AAP constraint C-001): this suite uses ONLY Node's
 * built-in test runner and assertion module — NO Jest / Mocha / Chai / any
 * third-party framework. Run it with the built-in runner, e.g.:
 *
 *     node --test                                     # whole suite from repo root
 *     node --test calculator-core/                     # whole calculator-core suite
 *     node --test calculator-core/calculator.test.js  # just this file
 *
 * (Note: the bare directory form `node --test calculator-core/` works because
 * calculator-core/package.json sets "main":"index.js" and calculator-core/index.js
 * is a directory-resolvable entry point that requires every *.test.js module; on
 * this runtime (Node v22) Node resolves the directory to that entry point and so
 * runs the full suite. See calculator-core/index.js.)
 *
 * Isolation note (AAP §2): calculate() records every SUCCESSFUL computation
 * into the shared, module-level `history` singleton (history.js keeps its
 * entries in a process-wide array shared by every require('./history')). A
 * `beforeEach` hook therefore clears that store before each test so the
 * history assertions stay deterministic and order-agnostic.
 *
 * The calculator.js contract exercised here:
 *   - calculate(op, ...operands) -> number; records { expression, result,
 *     timestamp } on success; THROWS on failure (never returns NaN/Infinity).
 *   - Errors carry a stable string `.code`: 'ERR_UNKNOWN_OPERATOR' (bad
 *     operator), 'ERR_ARITY' (too few operands), and 'ERR_OPERATION' (the
 *     engine rejected the operands — the engine message is forwarded verbatim
 *     and the original error is kept on `.cause`, with `.operator` set to the
 *     canonical symbol).
 *   - Expression format: binary -> "a <symbol> b"; unary sqrt -> "\u221a(a)"; an
 *     alias (e.g. 'add') always normalizes to its canonical symbol.
 *   - OPERATORS -> frozen Array<{ symbol, arity, label }> (7 operators).
 *   - getHistory() / clearHistory() delegate to history.js.
 *
 * Note on '\u221a': that escape is the SQUARE ROOT sign (U+221A, "\u221a"); it is
 * used consistently below so operator/expression comparisons match the exact
 * code point emitted by calculator.js.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const calc = require('./calculator');
const history = require('./history');

// ---------------------------------------------------------------------------
// Test isolation — calculate() writes into the shared module-level history
// singleton, so reset it before every test (AAP §2; history.js singleton note).
// ---------------------------------------------------------------------------
beforeEach(() => {
    history.clear();
});

// ===========================================================================
// 3a. Nominal dispatch (table-driven) — every operator returns the exact
//     expected numeric result via calc.calculate(operator, ...operands).
// ===========================================================================
test('3a: nominal dispatch returns exact results for all seven operators', () => {
    const cases = [
        { op: '+', args: [2, 3], expected: 5 },
        { op: '-', args: [5, 2], expected: 3 },
        { op: '*', args: [4, 3], expected: 12 },
        { op: '/', args: [10, 2], expected: 5 },
        { op: '%', args: [7, 3], expected: 1 },
        { op: '^', args: [2, 3], expected: 8 },
        { op: '\u221a', args: [9], expected: 3 }
    ];
    for (const { op, args, expected } of cases) {
        assert.equal(calc.calculate(op, ...args), expected);
    }
});

// Aliases resolve to the same canonical operation as their symbol. calculator.js
// registers: add / subtract / multiply / divide / modulus|mod / power|pow|** / sqrt.
test('3a: operator aliases resolve to the canonical operation', () => {
    const cases = [
        { op: 'add', args: [2, 3], expected: 5 },
        { op: 'subtract', args: [5, 2], expected: 3 },
        { op: 'multiply', args: [4, 3], expected: 12 },
        { op: 'divide', args: [10, 2], expected: 5 },
        { op: 'modulus', args: [7, 3], expected: 1 },
        { op: 'mod', args: [7, 3], expected: 1 },
        { op: 'power', args: [2, 3], expected: 8 },
        { op: 'pow', args: [2, 3], expected: 8 },
        { op: '**', args: [2, 3], expected: 8 },
        { op: 'sqrt', args: [9], expected: 3 }
    ];
    for (const { op, args, expected } of cases) {
        assert.equal(calc.calculate(op, ...args), expected);
    }
});

// An alias is normalized to its canonical symbol in the RECORDED expression:
// invoking the 'add' alias records '2 + 3', never 'add ...'.
test('3a: an alias is normalized to its canonical symbol in recorded history', () => {
    assert.equal(calc.calculate('add', 2, 3), 5);

    const entries = history.getAll();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].expression, '2 + 3');
});

// ===========================================================================
// 3b. Structured error / edge cases (constraint C-004) — invalid work MUST
//     throw a real Error carrying a stable `.code`, and MUST NEVER return a
//     silent NaN / Infinity.
// ===========================================================================

// Operation-level failures: the engine rejects the operands (divide/modulus by
// zero, square root of a negative, non-finite operands) and the facade
// re-surfaces each as an Error with `.code === 'ERR_OPERATION'` and the engine's
// message forwarded verbatim. assert.throws proves a throw occurred (so the
// call can never have returned a silent NaN/Infinity).
test('3b: invalid arithmetic throws structured ERR_OPERATION errors, never NaN/Infinity (C-004)', () => {
    const cases = [
        { op: '/', args: [5, 0], message: 'Divide by zero' },
        { op: '%', args: [5, 0], message: 'Modulus by zero' },
        { op: '\u221a', args: [-1], message: 'Square root of negative number' },
        { op: '+', args: [NaN, 1], message: 'Invalid operand: not a finite number' },
        { op: '+', args: [Infinity, 1], message: 'Invalid operand: not a finite number' }
    ];
    for (const { op, args, message } of cases) {
        assert.throws(
            () => calc.calculate(op, ...args),
            { code: 'ERR_OPERATION', message }
        );
    }
});

// A-002 (explicitly guarded): numeric STRINGS are NOT coerced to numbers — the
// engine's `typeof` guard rejects them, so the facade throws rather than
// computing a coerced result. This pins the "no silent coercion" contract in
// both operand positions.
test('3b: numeric strings are rejected, not coerced (A-002)', () => {
    assert.throws(
        () => calc.calculate('+', '2', 3),
        { code: 'ERR_OPERATION', message: 'Invalid operand: not a finite number' }
    );
    assert.throws(
        () => calc.calculate('+', 2, '3'),
        { code: 'ERR_OPERATION', message: 'Invalid operand: not a finite number' }
    );
});

// The wrapped operation error preserves the original engine error on `.cause`
// and tags the canonical operator symbol on `.operator` (facade error contract).
test('3b: an operation error preserves the original engine error as .cause and tags .operator', () => {
    assert.throws(
        () => calc.calculate('/', 5, 0),
        (err) => {
            assert.ok(err instanceof Error);
            assert.equal(err.code, 'ERR_OPERATION');
            assert.equal(err.operator, '/');
            assert.ok(err.cause instanceof Error);
            assert.equal(err.cause.message, 'Divide by zero');
            return true;
        }
    );
});

// Unknown operator -> ERR_UNKNOWN_OPERATOR (its message also matches
// /Unknown operator/). Inherited Object members must NOT resolve as operators,
// because the dispatch table is a null-prototype object.
test('3b: unknown operator throws ERR_UNKNOWN_OPERATOR', () => {
    assert.throws(() => calc.calculate('$', 1, 2), /Unknown operator/);
    assert.throws(() => calc.calculate('$', 1, 2), { code: 'ERR_UNKNOWN_OPERATOR' });
    assert.throws(() => calc.calculate('toString', 1, 2), { code: 'ERR_UNKNOWN_OPERATOR' });
    assert.throws(() => calc.calculate('constructor', 1, 2), { code: 'ERR_UNKNOWN_OPERATOR' });
});

// Too few operands -> ERR_ARITY. A binary operator called with one operand, and
// a unary operator called with none, are both arity errors (thrown BEFORE the
// engine runs, so nothing is computed or recorded).
test('3b: too few operands throws ERR_ARITY', () => {
    assert.throws(() => calc.calculate('+', 1), { code: 'ERR_ARITY' });
    assert.throws(() => calc.calculate('\u221a'), { code: 'ERR_ARITY' });
});

// ===========================================================================
// 3c. History side-effects — calculate() records successful computations (and
//     ONLY successful ones) as canonical { expression, result, timestamp }
//     entries; clearHistory() empties the store.
// ===========================================================================

// Records on success: a single computation yields exactly one well-formed entry.
test('3c: a successful computation is recorded as one well-formed entry', () => {
    const result = calc.calculate('+', 2, 3);
    assert.equal(result, 5);

    const entries = calc.getHistory();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].result, 5);
    assert.equal(entries[0].expression, '2 + 3');
    assert.ok(entries[0].timestamp instanceof Date);
});

// Does NOT record on error: a throwing computation leaves history untouched
// (recording happens strictly AFTER a successful engine call).
test('3c: a failed computation is NOT recorded', () => {
    assert.throws(() => calc.calculate('/', 1, 0));
    assert.equal(calc.getHistory().length, 0);
});

// Canonical BINARY expression format: "a <symbol> b".
test('3c: records the canonical binary expression format ("7 % 3")', () => {
    calc.calculate('%', 7, 3);
    assert.equal(history.getAll()[0].expression, '7 % 3');
});

// Canonical UNARY expression format: "\u221a(a)".
test('3c: records the canonical unary expression format ("\u221a(9)")', () => {
    calc.calculate('\u221a', 9);
    assert.equal(history.getAll()[0].expression, '\u221a(9)');
});

// clearHistory() empties the store after entries have been recorded.
test('3c: clearHistory() empties the recorded history', () => {
    calc.calculate('+', 1, 1);
    calc.calculate('*', 2, 2);
    assert.equal(calc.getHistory().length, 2);

    calc.clearHistory();
    assert.equal(calc.getHistory().length, 0);
});

// ===========================================================================
// 3d. OPERATORS descriptor — the public, UI-facing operator metadata array.
// ===========================================================================

// Shape: a 7-element array whose every entry exposes symbol/arity/label.
test('3d: OPERATORS is a 7-element array of { symbol, arity, label } descriptors', () => {
    assert.ok(Array.isArray(calc.OPERATORS));
    assert.equal(calc.OPERATORS.length, 7);

    for (const descriptor of calc.OPERATORS) {
        assert.equal(typeof descriptor.symbol, 'string');
        assert.equal(typeof descriptor.arity, 'number');
        assert.equal(typeof descriptor.label, 'string');
    }
});

// Arity: only the square-root descriptor is unary (1); every other is binary (2).
test('3d: only the \u221a descriptor is unary (arity 1); all others are binary (arity 2)', () => {
    for (const descriptor of calc.OPERATORS) {
        if (descriptor.symbol === '\u221a') {
            assert.equal(descriptor.arity, 1);
        } else {
            assert.equal(descriptor.arity, 2);
        }
    }
});

// Symbols: the descriptor set equals the seven supported symbols (order-independent).
test('3d: the OPERATORS symbol set equals the seven supported symbols', () => {
    const actual = calc.OPERATORS.map((descriptor) => descriptor.symbol).sort();
    const expected = ['+', '-', '*', '/', '%', '^', '\u221a'].sort();
    assert.deepStrictEqual(actual, expected);
});

// ===========================================================================
// 3e. Comprehensive structured-error contract (constraint C-004) — EVERY
//     failure class throws a real Error with the EXACT { name, code, message }
//     AND leaves history EMPTY. This pins that invalid work is never a silent
//     NaN/Infinity and is never recorded, for every documented failure mode:
//     unknown / non-string operators, arity (with exact messages), engine
//     domain guards (divide/modulus by zero incl. signed -0, sqrt of a
//     negative, non-finite / string operands), and finite-input INVALID
//     RESULTS (power domain / overflow, arithmetic overflow).
// ===========================================================================
test('3e: every failure class throws exact { name, code, message } and records nothing (C-004)', () => {
    const failures = [
        // Unknown / invalid operators — string and (safely handled) non-string.
        { args: ['$', 1, 2],                             code: 'ERR_UNKNOWN_OPERATOR', message: 'Unknown operator: $' },
        { args: ['toString', 1, 2],                      code: 'ERR_UNKNOWN_OPERATOR', message: 'Unknown operator: toString' },
        { args: [42, 1, 2],                              code: 'ERR_UNKNOWN_OPERATOR', message: 'Unknown operator: expected a string but received number' },
        { args: [null, 1, 2],                            code: 'ERR_UNKNOWN_OPERATOR', message: 'Unknown operator: expected a string but received object' },
        { args: [Symbol('+'), 1, 2],                     code: 'ERR_UNKNOWN_OPERATOR', message: 'Unknown operator: expected a string but received symbol' },
        { args: [{ toString() { return '+'; } }, 1, 2],  code: 'ERR_UNKNOWN_OPERATOR', message: 'Unknown operator: expected a string but received object' },
        // Arity — exact messages, honoring each operator's arity.
        { args: ['+', 1],                                code: 'ERR_ARITY',            message: 'Operator "+" expects 2 operand(s)' },
        { args: ['\u221a'],                              code: 'ERR_ARITY',            message: 'Operator "\u221a" expects 1 operand(s)' },
        // Engine domain guards (message forwarded verbatim), including signed zero -0.
        { args: ['/', 5, 0],                             code: 'ERR_OPERATION',        message: 'Divide by zero' },
        { args: ['/', 5, -0],                            code: 'ERR_OPERATION',        message: 'Divide by zero' },
        { args: ['%', 5, 0],                             code: 'ERR_OPERATION',        message: 'Modulus by zero' },
        { args: ['%', 5, -0],                            code: 'ERR_OPERATION',        message: 'Modulus by zero' },
        { args: ['\u221a', -1],                          code: 'ERR_OPERATION',        message: 'Square root of negative number' },
        { args: ['+', NaN, 1],                           code: 'ERR_OPERATION',        message: 'Invalid operand: not a finite number' },
        { args: ['+', '2', 3],                           code: 'ERR_OPERATION',        message: 'Invalid operand: not a finite number' },
        // Finite-input INVALID RESULTS (result-domain guard): power domain / overflow / arithmetic overflow.
        { args: ['^', -2, 0.5],                          code: 'ERR_OPERATION',        message: 'Result is not a finite number' },
        { args: ['^', 0, -1],                            code: 'ERR_OPERATION',        message: 'Result is not a finite number' },
        { args: ['^', Number.MAX_VALUE, 2],              code: 'ERR_OPERATION',        message: 'Result is not a finite number' },
        { args: ['+', Number.MAX_VALUE, Number.MAX_VALUE], code: 'ERR_OPERATION',      message: 'Result is not a finite number' }
    ];
    for (let i = 0; i < failures.length; i += 1) {
        const { args, code, message } = failures[i];
        history.clear();
        assert.throws(
            () => calc.calculate(...args),
            { name: 'Error', code, message },
            'failure case #' + i + ' (expected code ' + code + ')'
        );
        // Side-effect proof: a FAILED computation is NEVER recorded.
        assert.equal(history.getAll().length, 0, 'failure case #' + i + ' must leave history empty');
    }
});

// A non-string operator whose toString() forges a valid key ('+') must NOT be
// coerced into executing an operation (CWE-20), and must NOT record history.
test('3e: an object operator with toString()->"+" is rejected, not executed or recorded', () => {
    history.clear();
    assert.throws(
        () => calc.calculate({ toString() { return '+'; } }, 1, 2),
        { code: 'ERR_UNKNOWN_OPERATOR' }
    );
    assert.equal(history.getAll().length, 0);
});

// ===========================================================================
// 3f. Dispatch contract (F11) — every alias family normalizes to its CANONICAL
//     symbol in the RECORDED expression, and extra operands beyond the
//     operator's arity are ignored (minimum-arity policy).
// ===========================================================================
test('3f: each alias family records the CANONICAL-symbol expression (not the alias)', () => {
    const cases = [
        { op: 'subtract', args: [5, 2],  expected: '5 - 2' },
        { op: 'multiply', args: [4, 3],  expected: '4 * 3' },
        { op: 'divide',   args: [10, 2], expected: '10 / 2' },
        { op: 'modulus',  args: [7, 3],  expected: '7 % 3' },
        { op: 'mod',      args: [7, 3],  expected: '7 % 3' },
        { op: 'power',    args: [2, 3],  expected: '2 ^ 3' },
        { op: 'pow',      args: [2, 3],  expected: '2 ^ 3' },
        { op: '**',       args: [2, 3],  expected: '2 ^ 3' },
        { op: 'sqrt',     args: [9],     expected: '\u221a(9)' }
    ];
    for (const { op, args, expected } of cases) {
        history.clear();
        calc.calculate(op, ...args);
        const entries = history.getAll();
        assert.equal(entries.length, 1, 'alias "' + op + '" should record exactly one entry');
        assert.equal(entries[0].expression, expected, 'alias "' + op + '" canonical expression');
    }
});

test('3f: extra operands beyond arity are ignored (minimum-arity), using only the needed operands', () => {
    // Binary: only the first two operands are used; the rest are ignored.
    history.clear();
    assert.equal(calc.calculate('+', 1, 2, 99, 100), 3);
    assert.equal(history.getAll().length, 1);
    assert.equal(history.getAll()[0].expression, '1 + 2');

    // Unary sqrt: only the first operand is used; extras are ignored.
    history.clear();
    assert.equal(calc.calculate('\u221a', 9, 99), 3);
    assert.equal(history.getAll().length, 1);
    assert.equal(history.getAll()[0].expression, '\u221a(9)');
});

// ===========================================================================
// 3g. OPERATORS metadata + immutability + dispatch integrity + getHistory
//     defensive snapshots (F12).
// ===========================================================================

// EXACT descriptor array, in definition order, with precise labels/keys.
test('3g: OPERATORS is the EXACT ordered 7-descriptor array (symbol, arity, label)', () => {
    assert.deepStrictEqual(calc.OPERATORS, [
        { symbol: '+', arity: 2, label: 'Add' },
        { symbol: '-', arity: 2, label: 'Subtract' },
        { symbol: '*', arity: 2, label: 'Multiply' },
        { symbol: '/', arity: 2, label: 'Divide' },
        { symbol: '%', arity: 2, label: 'Modulus' },
        { symbol: '^', arity: 2, label: 'Power' },
        { symbol: '\u221a', arity: 1, label: 'Square root' }
    ]);
});

// Both the array and every descriptor object are frozen (immutable contract).
test('3g: the OPERATORS array AND every descriptor are frozen', () => {
    assert.ok(Object.isFrozen(calc.OPERATORS));
    for (const descriptor of calc.OPERATORS) {
        assert.ok(Object.isFrozen(descriptor));
    }
});

// Mutation attempts on the descriptor array/objects throw in strict mode and
// cannot register a new operator or alter existing dispatch behavior.
test('3g: mutation attempts on OPERATORS are rejected and cannot alter dispatch', () => {
    assert.throws(() => { calc.OPERATORS.push({ symbol: '!', arity: 2, label: 'Bang' }); }, TypeError);
    assert.throws(() => { calc.OPERATORS[0] = { symbol: 'x', arity: 9, label: 'X' }; }, TypeError);
    assert.throws(() => { calc.OPERATORS[0].symbol = 'x'; }, TypeError);
    assert.throws(() => { calc.OPERATORS[0].arity = 99; }, TypeError);

    // The array content is intact...
    assert.equal(calc.OPERATORS.length, 7);
    assert.equal(calc.OPERATORS[0].symbol, '+');
    assert.equal(calc.OPERATORS[0].arity, 2);

    // ...the fake '!' operator was never registered for dispatch...
    assert.throws(() => calc.calculate('!', 1, 2), { code: 'ERR_UNKNOWN_OPERATOR' });

    // ...and the genuine '+' operator still dispatches correctly.
    history.clear();
    assert.equal(calc.calculate('+', 1, 2), 3);
});

// getHistory() hands back defensive, frozen snapshots: writing to a returned
// entry, mutating its Date clone, or pushing onto the returned array can never
// corrupt the underlying store, and each call yields independent snapshots.
test('3g: getHistory() returns defensive, frozen snapshots that cannot corrupt the store', () => {
    history.clear();
    calc.calculate('+', 2, 3);

    const first = calc.getHistory();
    assert.equal(first.length, 1);
    assert.ok(Object.isFrozen(first[0]));

    // Reassigning a frozen entry's field throws and cannot reach the store.
    assert.throws(() => { first[0].result = 999; }, TypeError);
    // Mutating the returned Date clone cannot corrupt the store.
    first[0].timestamp.setUTCFullYear(1900);
    // Pushing onto the returned array cannot grow the store.
    first.push({ expression: 'injected', result: -1, timestamp: new Date() });

    const second = calc.getHistory();
    assert.equal(second.length, 1);                               // defensive array copy
    assert.equal(second[0].result, 5);                            // field write was isolated
    assert.equal(second[0].expression, '2 + 3');
    assert.notEqual(second[0].timestamp.getUTCFullYear(), 1900);  // Date clone was isolated
    assert.notStrictEqual(first[0], second[0]);                   // independent snapshots
});

// ===========================================================================
// F1 (CRITICAL) — Browser-bridge fail-closed regression tests.
//
// Root cause (review finding F1): calculator-ui/index.html bridges the pure
// CommonJS math-engine files into the browser by running each `module.exports =
// fn;` op file under a shared `window.module` shim and copying the export into
// `window.mathEngine`. The ORIGINAL bridge set `window.module = { exports: {} }`
// ONCE. If a later op script failed to load (404 / blocked / parse error),
// `module.exports` still held the PREVIOUS op's function, so the capture copied
// a STALE DUPLICATE — e.g. `window.mathEngine.modulus === window.mathEngine.divide`.
// calculator.js only type-checked its dependencies (both looked like functions),
// so `7 % 3` was computed by `divide` and silently displayed 2.3333333333333335
// instead of 1. The calculator did NOT fail; it produced WRONG arithmetic.
//
// The two-layer fix under regression here:
//   (1) index.html arms a UNIQUE private sentinel on `module.exports` BEFORE each
//       op script and, AFTER each, captures the export ONLY when it is a fresh
//       callable that is NOT the sentinel (then re-arms the sentinel). A missing
//       script therefore leaves the sentinel in place -> the op key stays ABSENT
//       (never a stale duplicate).
//   (2) calculator.js validates the injected browser globals at init: a missing/
//       non-callable op AND an identity collision (two ops that are the SAME
//       function reference — the exact stale-duplicate corruption) both throw a
//       structured ERR_DEPENDENCY, so the core FAILS CLOSED (publishes no usable
//       `calculatorCore`) instead of computing wrong results.
//
// These tests reproduce the browser wiring headlessly with node:vm. The harness
// runs the EXACT bridge protocol from index.html (sentinel shim + per-op
// __captureOp + teardown) over the REAL math-engine op source files, optionally
// "blocking" an op to simulate a failed <script>, then loads the REAL history.js
// and calculator.js through their UMD browser (else) branch — proving the fix in
// the same code path the browser uses, with zero third-party dependencies (C-001).
// ===========================================================================
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// The seven engine operations, in the exact <script> order used by index.html.
const BRIDGE_OP_ORDER = ['add', 'subtract', 'multiply', 'divide', 'modulus', 'power', 'sqrt'];

// Read a source file from this package by repo-relative path (this test lives in
// calculator-core/, so __dirname is calculator-core/).
function readCoreSrc(relParts) {
    return fs.readFileSync(path.join(__dirname, ...relParts), 'utf8');
}

// The sentinel shim + __captureOp helper, copied VERBATIM from index.html step 1
// so this harness exercises the real bridge logic (kept byte-for-byte in sync).
const BRIDGE_SHIM_SRC = `
    window.mathEngine = {};
    window.module = { exports: {} };
    window.__mathEngineUnloaded = { calculatorBridgeSentinel: true };
    window.module.exports = window.__mathEngineUnloaded;
    window.__captureOp = function (name) {
        var ex = window.module.exports;
        if (ex !== window.__mathEngineUnloaded && typeof ex === 'function') {
            window.mathEngine[name] = ex;
        }
        window.module.exports = window.__mathEngineUnloaded;
    };
`;

// index.html step 3: tear the CommonJS shim + bridge helpers down so the UMD
// history.js / calculator.js files take their BROWSER (else) branch.
const BRIDGE_TEARDOWN_SRC =
    'window.module = undefined; window.__captureOp = undefined; window.__mathEngineUnloaded = undefined;';

// Build a browser-like vm sandbox where `window` IS the global (as in a real
// browser), run the full index.html bridge protocol over the real op sources
// (skipping any op named in `blockedOps` to simulate a failed <script>), load the
// real history.js, then attempt to load the real calculator.js. Returns the
// sandbox plus any error calculator.js threw at init.
function runBrowserBridge(blockedOps) {
    const blocked = blockedOps || [];
    const sandbox = {};
    const ctx = vm.createContext(sandbox);
    // Browser invariant: window === globalThis. Establish it before anything else
    // so bare `module` (used by the op files) and `window.module` (used by the
    // bridge) resolve to the SAME global property — exactly as in the browser.
    vm.runInContext('window = globalThis;', ctx);

    // Step 1 — sentinel shim + __captureOp.
    vm.runInContext(BRIDGE_SHIM_SRC, ctx);

    // Step 2 — for each op: run the op source (unless blocked), then capture.
    // A blocked op is NOT run, so module.exports stays the sentinel and the op
    // key is never added to window.mathEngine (fail closed, never a duplicate).
    for (const name of BRIDGE_OP_ORDER) {
        if (blocked.indexOf(name) === -1) {
            vm.runInContext(readCoreSrc(['math-engine', name + '.js']), ctx);
        }
        vm.runInContext('window.__captureOp(' + JSON.stringify(name) + ');', ctx);
    }

    // Step 3 — teardown so the UMD files take the browser branch.
    vm.runInContext(BRIDGE_TEARDOWN_SRC, ctx);

    // Step 4 — history.js self-registers window.calculatorHistory (browser branch).
    vm.runInContext(readCoreSrc(['history.js']), ctx);

    // Step 5 — calculator.js reads window.mathEngine + window.calculatorHistory and
    // publishes window.calculatorCore (or throws ERR_DEPENDENCY, failing closed).
    let error = null;
    try {
        vm.runInContext(readCoreSrc(['calculator.js']), ctx);
    } catch (e) {
        error = e;
    }
    return { sandbox, error };
}

// Load calculator.js through its browser branch against a caller-supplied
// mathEngine + history (bypassing the bridge) to exercise calculator.js's own
// dependency guards directly. `module` is never defined, so the UMD else branch
// runs. Returns the sandbox plus any init error.
function loadCoreInBrowser(mathEngine, history) {
    const sandbox = {};
    const ctx = vm.createContext(sandbox);
    vm.runInContext('window = globalThis;', ctx);
    sandbox.window.mathEngine = mathEngine;      // window === global, so also sandbox.mathEngine
    sandbox.window.calculatorHistory = history;
    let error = null;
    try {
        vm.runInContext(readCoreSrc(['calculator.js']), ctx);
    } catch (e) {
        error = e;
    }
    return { sandbox, error };
}

test('F1 browser bridge: a MISSING operation script fails CLOSED (never a stale duplicate)', () => {
    // Simulate modulus.js failing to load (the finding's exact scenario).
    const { sandbox, error } = runBrowserBridge(['modulus']);

    // The sentinel bridge left `modulus` ABSENT — critically, it is NOT a stale
    // duplicate of `divide` (the old catastrophic bug that computed 7 % 3 as 7 / 3).
    assert.equal(typeof sandbox.mathEngine.modulus, 'undefined',
        'a failed op script must leave its key absent, not a stale export');
    assert.notStrictEqual(sandbox.mathEngine.modulus, sandbox.mathEngine.divide,
        'modulus must NEVER alias divide when its script fails to load');
    // Every op that DID load is still captured correctly.
    assert.equal(typeof sandbox.mathEngine.divide, 'function');
    assert.equal(typeof sandbox.mathEngine.add, 'function');

    // calculator.js refused to publish a usable core: it threw ERR_DEPENDENCY
    // naming the missing operation, and window.calculatorCore was never set.
    assert.ok(error, 'calculator.js must throw when a required op is missing');
    assert.equal(error.code, 'ERR_DEPENDENCY');
    assert.match(error.message, /modulus/);
    assert.equal(typeof sandbox.calculatorCore, 'undefined',
        'no usable calculatorCore may be published when a dependency is missing');
});

test('F1 browser bridge: a HEALTHY load publishes calculatorCore with 7 distinct ops', () => {
    const { sandbox, error } = runBrowserBridge([]); // nothing blocked

    assert.equal(error, null, 'a complete bridge must not throw');
    assert.equal(typeof sandbox.calculatorCore, 'object');
    assert.notEqual(sandbox.calculatorCore, null);

    // All seven ops were captured and are DISTINCT function references.
    const refs = new Set();
    for (const name of BRIDGE_OP_ORDER) {
        assert.equal(typeof sandbox.mathEngine[name], 'function', name + ' should be captured');
        refs.add(sandbox.mathEngine[name]);
    }
    assert.equal(refs.size, BRIDGE_OP_ORDER.length, 'all seven ops must be distinct functions');
    assert.notStrictEqual(sandbox.mathEngine.modulus, sandbox.mathEngine.divide);

    // End-to-end through the published facade: modulus computes 7 % 3 === 1
    // (NOT 7 / 3 ≈ 2.333, which is exactly what the F1 bug produced).
    assert.equal(sandbox.calculatorCore.calculate('%', 7, 3), 1);
});

test('F1 browser bridge: a STALE DUPLICATE (modulus === divide) fails CLOSED via identity guard', () => {
    // Directly feed calculator.js the exact corruption the old bridge produced:
    // `modulus` pointing at the SAME function as `divide`. A plain typeof check
    // cannot catch this (both are functions); the identity-collision guard must.
    const divide = require('./math-engine/divide');
    const engineWithDuplicate = {
        add: require('./math-engine/add'),
        subtract: require('./math-engine/subtract'),
        multiply: require('./math-engine/multiply'),
        divide: divide,
        modulus: divide, // STALE DUPLICATE — the F1 corruption
        power: require('./math-engine/power'),
        sqrt: require('./math-engine/sqrt')
    };
    const historyStub = { record() {}, getAll() { return []; }, clear() {} };

    const { sandbox, error } = loadCoreInBrowser(engineWithDuplicate, historyStub);

    assert.ok(error, 'a duplicate operation reference must be rejected');
    assert.equal(error.code, 'ERR_DEPENDENCY');
    assert.match(error.message, /same function/);
    assert.match(error.message, /stale|duplicate/);
    assert.equal(typeof sandbox.calculatorCore, 'undefined',
        'no usable calculatorCore may be published when two ops are the same function');
});

