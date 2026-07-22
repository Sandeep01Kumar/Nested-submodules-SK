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

test('add: rejects a non-finite RESULT from finite operands (overflow) (C-004)', () => {
    // Two FINITE operands can still overflow to a non-finite value
    // (add(Number.MAX_VALUE, Number.MAX_VALUE) === Infinity). The module must
    // surface this as an explicit result-domain error rather than silently
    // returning Infinity — input-only validation is NOT sufficient (C-004).
    assert.throws(
        () => add(Number.MAX_VALUE, Number.MAX_VALUE),
        { name: 'Error', message: 'Result is not a finite number' }
    );
});
