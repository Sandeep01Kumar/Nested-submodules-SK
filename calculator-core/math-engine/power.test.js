'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const power = require('./power');

test('power: nominal powers (table-driven)', () => {
    const cases = [
        { a: 2, b: 3, expected: 8 },
        { a: 9, b: 0.5, expected: 3 },
        { a: 5, b: 0, expected: 1 },
        { a: 2, b: -1, expected: 0.5 },
        { a: -2, b: 2, expected: 4 }
    ];
    for (const { a, b, expected } of cases) {
        assert.equal(power(a, b), expected);
    }
});

test('power: backward compatibility preserves number type', () => {
    assert.equal(typeof power(2, 3), 'number');
});

test('power: rejects non-finite / non-numeric operands (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['2', 3], [2, '3'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => power(a, b), /Invalid operand: not a finite number/);
    }
});

test('power: rejects non-finite RESULTS from finite operands (NaN / Infinity / overflow) (C-004)', () => {
    // Finite operands can still drive Math.pow to a non-finite value. Each of
    // these MUST throw an explicit result-domain error, never silently return
    // NaN/Infinity (a result guard — not just input validation — is required):
    //   power(-2, 0.5)             -> NaN      (negative base, fractional exponent)
    //   power(0, -1)               -> Infinity (zero base, negative exponent)
    //   power(Number.MAX_VALUE, 2) -> Infinity (overflow)
    const cases = [
        [-2, 0.5],
        [0, -1],
        [Number.MAX_VALUE, 2]
    ];
    for (const [a, b] of cases) {
        assert.throws(
            () => power(a, b),
            { name: 'Error', message: 'Result is not a finite number' }
        );
    }
});
