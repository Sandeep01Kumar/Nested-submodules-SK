'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulus = require('./modulus');

test('modulus: nominal remainders (table-driven)', () => {
    const cases = [
        { a: 7, b: 3, expected: 1 },
        { a: 10, b: 2, expected: 0 },
        { a: 9, b: 4, expected: 1 },
        { a: -7, b: 3, expected: -1 },   // negative dividend: JS remainder sign follows the DIVIDEND
        { a: 7, b: -3, expected: 1 },    // positive dividend, negative divisor: sign still follows the dividend
        { a: -7, b: -3, expected: -1 },  // both operands negative: sign still follows the dividend
        { a: 5.5, b: 2, expected: 1.5 }
    ];
    for (const { a, b, expected } of cases) {
        assert.equal(modulus(a, b), expected);
    }
});

test('modulus: modulus-by-zero throws (including signed zero -0)', () => {
    assert.throws(() => modulus(5, 0), /Modulus by zero/);
    assert.throws(() => modulus(0, 0), /Modulus by zero/);
    // -0 === 0 in JavaScript, so a -0 divisor MUST be guarded identically;
    // otherwise `a % -0` would yield a silent NaN (C-004).
    assert.throws(() => modulus(5, -0), /Modulus by zero/);
});

test('modulus: rejects non-finite / non-numeric operands (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['7', 3], [7, '3'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => modulus(a, b), /Invalid operand: not a finite number/);
    }
});
