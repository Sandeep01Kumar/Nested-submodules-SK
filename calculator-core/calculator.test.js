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
 *     node --test calculator-core/calculator.test.js  # just this file
 *
 * (Note: a bare directory argument such as `node --test calculator-core/` is
 * NOT a valid invocation on this runtime — Node tries to load the directory as
 * a module and fails with MODULE_NOT_FOUND. Use the repo-root form above, an
 * explicit test file, or a glob like `node --test "calculator-core/**\/*.test.js"`.)
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
