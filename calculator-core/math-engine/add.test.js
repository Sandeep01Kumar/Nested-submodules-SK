'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const add = require('./add');

test('add: nominal sums (table-driven)', () => {
    const cases = [
        { a: 2, b: 3, expected: 5 },
        { a: -1, b: 1, expected: 0 },
        { a: 0, b: 0, expected: 0 },
        { a: 2.5, b: 0.5, expected: 3 },
        { a: -4, b: -6, expected: -10 }
    ];
    for (const { a, b, expected } of cases) {
        assert.equal(add(a, b), expected);
    }
});

test('add: backward compatibility preserves value and number type', () => {
    assert.equal(add(2, 3), 5);
    assert.equal(typeof add(2, 3), 'number');
});

test('add: rejects non-finite / non-numeric operands (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['2', 3], [2, '3'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => add(a, b), /Invalid operand: not a finite number/);
    }
});
