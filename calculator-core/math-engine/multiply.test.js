'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const multiply = require('./multiply');

test('multiply: nominal products (table-driven)', () => {
    const cases = [
        { a: 4, b: 3, expected: 12 },
        { a: 0, b: 5, expected: 0 },
        { a: -2, b: 3, expected: -6 },
        { a: -2, b: -3, expected: 6 },
        { a: 2.5, b: 2, expected: 5 }
    ];
    for (const { a, b, expected } of cases) {
        assert.equal(multiply(a, b), expected);
    }
});

test('multiply: backward compatibility preserves value and number type', () => {
    assert.equal(multiply(4, 3), 12);
    assert.equal(typeof multiply(4, 3), 'number');
});

test('multiply: rejects non-finite / non-numeric operands (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['4', 3], [4, '3'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => multiply(a, b), /Invalid operand: not a finite number/);
    }
});
