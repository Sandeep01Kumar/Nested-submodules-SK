'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const divide = require('./divide');

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

test('divide: divide-by-zero throws (C-004)', () => {
    assert.throws(() => divide(5, 0), /Divide by zero/);
    assert.throws(() => divide(-5, 0), /Divide by zero/);
    assert.throws(() => divide(0, 0), /Divide by zero/);
});

test('divide: rejects non-finite / non-numeric operands (A-002 guarded)', () => {
    const bad = [
        [NaN, 1], [1, NaN], [Infinity, 1], [1, -Infinity],
        ['10', 2], [10, '2'], [null, 1], [1, undefined], [{}, 1]
    ];
    for (const [a, b] of bad) {
        assert.throws(() => divide(a, b), /Invalid operand: not a finite number/);
    }
});
