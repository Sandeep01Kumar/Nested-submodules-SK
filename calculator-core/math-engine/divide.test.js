'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const divide = require('./divide');

// Exact error-object matchers (F9). Each asserts on the precise error `name`
// AND the full, exact `message`. Unlike an unanchored regex — which validates
// against String(error) and therefore accepts decorated, prefixed, or suffixed
// messages — these reject any message that is not character-for-character exact.
// A deliberately broken implementation (e.g. one that checks `b === 0` before
// validating operands, or that emits a decorated message) cannot pass.
const INVALID_OPERAND = { name: 'Error', message: 'Invalid operand: not a finite number' };
const DIVIDE_BY_ZERO = { name: 'Error', message: 'Divide by zero' };
const NON_FINITE_RESULT = { name: 'Error', message: 'Result is not a finite number' };

test('divide: nominal quotients (table-driven)', () => {
    const cases = [
        { a: 10, b: 2, expected: 5 },
        { a: 9, b: 3, expected: 3 },
        { a: -6, b: 2, expected: -3 },
        { a: 7, b: 2, expected: 3.5 },
        { a: 0, b: 5, expected: 0 }
    ];
    for (const { a, b, expected } of cases) {
        assert.equal(divide(a, b), expected);
    }
});

test('divide: divide-by-zero throws the exact error (C-004)', () => {
    assert.throws(() => divide(5, 0), DIVIDE_BY_ZERO);
    assert.throws(() => divide(-5, 0), DIVIDE_BY_ZERO);
    assert.throws(() => divide(0, 0), DIVIDE_BY_ZERO);
    // Signed negative zero is still a zero divisor.
    assert.throws(() => divide(5, -0), DIVIDE_BY_ZERO);
});

test('divide: rejects non-finite / non-numeric operands with the exact error (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['10', 2], [10, '2'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => divide(a, b), INVALID_OPERAND);
    }
});

// Validation-before-zero PRECEDENCE (F9): an invalid operand combined with a
// zero divisor must surface the INVALID-OPERAND error, never the divide-by-zero
// error. This pins the guard ORDER (operand validation runs before the b === 0
// check), so a "zero-first" implementation is rejected.
test('divide: invalid operand takes precedence over a zero divisor', () => {
    assert.throws(() => divide(NaN, 0), INVALID_OPERAND);
    assert.throws(() => divide(Infinity, 0), INVALID_OPERAND);
    assert.throws(() => divide('5', 0), INVALID_OPERAND);
    assert.throws(() => divide(undefined, 0), INVALID_OPERAND);
});

// Result-domain overflow regression (F4/F9): finite, non-zero operands whose
// exact quotient overflows to a non-finite value must throw the result-domain
// error instead of silently returning Infinity.
test('divide: finite-input overflow throws the result-domain error', () => {
    assert.throws(() => divide(Number.MAX_VALUE, Number.MIN_VALUE), NON_FINITE_RESULT);
});
