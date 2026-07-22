'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const subtract = require('./subtract');

test('subtract: nominal differences (table-driven)', () => {
    const cases = [
        { a: 5, b: 2, expected: 3 },
        { a: 0, b: 0, expected: 0 },
        { a: -1, b: -1, expected: 0 },
        { a: 2.5, b: 0.5, expected: 2 },
        { a: 1, b: 4, expected: -3 }
    ];
    for (const { a, b, expected } of cases) {
        assert.equal(subtract(a, b), expected);
    }
});

test('subtract: backward compatibility preserves value and number type', () => {
    assert.equal(subtract(5, 2), 3);
    assert.equal(typeof subtract(5, 2), 'number');
});

test('subtract: rejects non-finite / non-numeric operands (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['5', 2], [5, '2'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => subtract(a, b), /Invalid operand: not a finite number/);
    }
});
