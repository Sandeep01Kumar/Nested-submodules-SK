'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const sqrt = require('./sqrt');

test('sqrt: nominal roots (table-driven)', () => {
    const cases = [
        { a: 9, expected: 3 },
        { a: 0, expected: 0 },
        { a: 1, expected: 1 },
        { a: 4, expected: 2 },
        { a: 2.25, expected: 1.5 }
    ];
    for (const { a, expected } of cases) {
        assert.equal(sqrt(a), expected);
    }
});

test('sqrt: square root of negative throws', () => {
    assert.throws(() => sqrt(-1), /Square root of negative number/);
    assert.throws(() => sqrt(-0.0001), /Square root of negative number/);
});

test('sqrt: negative zero (-0) is accepted and returns -0 (signed-zero boundary)', () => {
    // -0 is the exact boundary of the negative-input guard: `-0 < 0` is FALSE,
    // so a -0 operand is NOT rejected as "negative" (unlike -0.0001, above).
    // Math.sqrt(-0) === -0, so the op returns -0. Object.is pins the SIGN too —
    // a plain `=== 0` would also accept +0 and miss a sign regression.
    assert.ok(Object.is(sqrt(-0), -0));
});

test('sqrt: rejects non-finite / non-numeric operand (A-002 guarded)', () => {
    const bad = [NaN, Infinity, -Infinity, '9', null, undefined, {}];
    for (const a of bad) {
        assert.throws(() => sqrt(a), /Invalid operand: not a finite number/);
    }
});
