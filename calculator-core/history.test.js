'use strict';

/**
 * calculator-core/history.test.js
 *
 * Unit tests for the in-memory Calculation History API (PR 3 · calculator-core).
 * Subject under test: calculator-core/history.js.
 *
 * Zero-dependency posture (AAP constraint C-001): this suite uses ONLY Node's
 * built-in test runner and assertion module — no Jest / Mocha / Chai / any
 * third-party framework. Run it with the built-in runner:
 *
 *     node --test calculator-core/history.test.js
 *     node --test calculator-core/            # folder suite
 *
 * Isolation note: history.js keeps its entries in a MODULE-LEVEL SINGLETON
 * array that is shared by every require('./history') within the same Node
 * process. A `beforeEach` hook therefore clears the store before every test so
 * the cases stay independent and order-agnostic (never flaky).
 *
 * The `history.js` contract exercised here (see history.js §4):
 *   - record(entry)  -> normalizes to { expression:string, result:*, timestamp:Date },
 *                        pushes it, and returns that same stored object. A missing
 *                        `expression` becomes ''; a non-Date `timestamp` defaults to
 *                        new Date(); a supplied Date is kept by reference. Throws
 *                        TypeError when `entry` is null / not an object.
 *   - getAll()       -> a DEFENSIVE shallow copy (new array, same element refs),
 *                        oldest-first insertion order.
 *   - list()         -> alias of getAll().
 *   - clear()        -> empties the store, returns undefined.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const history = require('./history');

// ---------------------------------------------------------------------------
// Test isolation — reset the shared singleton store before every test so each
// case begins from a known-empty state (AAP §2, history.js §4 singleton note).
// ---------------------------------------------------------------------------
beforeEach(() => {
    history.clear();
});

// Case 1 — record + getAll: a recorded entry is retrievable and well-formed.
test('record stores an entry and getAll returns it', () => {
    const stored = history.record({ expression: '2 + 3', result: 5 });

    // The returned entry is normalized and well-formed.
    assert.equal(stored.expression, '2 + 3');
    assert.equal(stored.result, 5);
    assert.ok(stored.timestamp instanceof Date);

    // The store now holds exactly one, matching entry.
    const all = history.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].expression, '2 + 3');
    assert.equal(all[0].result, 5);
    assert.ok(all[0].timestamp instanceof Date);
});

// Case 2 — record defaults the timestamp: an entry recorded WITHOUT a timestamp
// is assigned a Date captured at record time, on both the returned value and the
// stored entry.
test('record defaults timestamp to a Date when none is provided', () => {
    const before = Date.now();
    const stored = history.record({ expression: 'no timestamp', result: 42 });
    const after = Date.now();

    // Returned value carries a defaulted Date within the record-time window.
    assert.ok(stored.timestamp instanceof Date);
    assert.ok(stored.timestamp.getTime() >= before);
    assert.ok(stored.timestamp.getTime() <= after);

    // The stored entry likewise carries a Date timestamp.
    const all = history.getAll();
    assert.equal(all.length, 1);
    assert.ok(all[0].timestamp instanceof Date);
});

// Case 3 — record preserves a provided Date timestamp exactly (by reference and
// by instant).
test('record preserves a provided Date timestamp exactly', () => {
    const t = new Date('2020-01-01T00:00:00Z');
    const stored = history.record({ expression: 'fixed timestamp', result: 1, timestamp: t });

    // Same object reference is kept (history.js stores the Date as-is).
    assert.strictEqual(stored.timestamp, t);
    // ...and therefore the same instant.
    assert.equal(stored.timestamp.getTime(), t.getTime());

    // The stored entry references the very same Date instance.
    const all = history.getAll();
    assert.strictEqual(all[0].timestamp, t);
    assert.equal(all[0].timestamp.getTime(), t.getTime());
});

// Case 4 — record returns the normalized stored entry: the return value carries
// all three canonical fields and equals the entry retrievable via getAll().
test('record returns the normalized stored entry equal to getAll() element', () => {
    const stored = history.record({ expression: '7 * 6', result: 42 });

    // The return value exposes the canonical shape.
    assert.ok(Object.prototype.hasOwnProperty.call(stored, 'expression'));
    assert.ok(Object.prototype.hasOwnProperty.call(stored, 'result'));
    assert.ok(Object.prototype.hasOwnProperty.call(stored, 'timestamp'));

    const all = history.getAll();
    assert.equal(all.length, 1);

    // Deep value equality with the entry retrievable via getAll()...
    assert.deepStrictEqual(all[0], stored);
    // ...and it is in fact the same object reference held internally.
    assert.strictEqual(all[0], stored);
});

// Case 5 — list() is an alias of getAll(): both return equal snapshots.
test('list() is an alias of getAll()', () => {
    history.record({ expression: '1 + 1', result: 2 });
    history.record({ expression: '2 + 2', result: 4 });

    const viaList = history.list();
    const viaGetAll = history.getAll();

    assert.equal(viaList.length, 2);
    assert.equal(viaGetAll.length, 2);
    assert.deepStrictEqual(viaList, viaGetAll);
});

// Case 6 — insertion order is preserved (oldest first).
test('getAll() preserves insertion order (oldest first)', () => {
    history.record({ expression: 'a', result: 1 });
    history.record({ expression: 'b', result: 2 });
    history.record({ expression: 'c', result: 3 });

    const expressions = history.getAll().map((entry) => entry.expression);
    assert.deepStrictEqual(expressions, ['a', 'b', 'c']);
});

// Case 7 — clear() empties the store (and returns undefined).
test('clear() empties the store', () => {
    history.record({ expression: 'x', result: 1 });
    history.record({ expression: 'y', result: 2 });
    assert.equal(history.getAll().length, 2);

    const returnValue = history.clear();

    assert.equal(history.getAll().length, 0);
    assert.equal(returnValue, undefined);
});

// Case 8 — getAll() returns a defensive copy: mutating the returned array must
// NOT corrupt the internal store.
test('getAll() returns a defensive copy that cannot mutate the store', () => {
    history.record({ expression: 'x', result: 1 });

    const snapshot = history.getAll();
    const originalLength = snapshot.length; // 1

    // External mutation of the returned array...
    snapshot.push({ expression: 'injected', result: 999 });
    snapshot.pop();
    snapshot.splice(0, snapshot.length);

    // ...leaves the internal store untouched.
    assert.equal(history.getAll().length, originalLength);
    assert.equal(history.getAll()[0].expression, 'x');
    assert.equal(history.getAll()[0].result, 1);
});

// Case 9 — table-driven: many records are stored in order with matching values.
test('records multiple entries (table-driven) preserving count and values', () => {
    const inputs = [
        { expression: '2 + 3', result: 5 },
        { expression: '10 - 4', result: 6 },
        { expression: '6 * 7', result: 42 },
        { expression: '20 / 5', result: 4 },
        { expression: '10 % 3', result: 1 }
    ];

    for (const input of inputs) {
        history.record(input);
    }

    const all = history.getAll();
    assert.equal(all.length, inputs.length);

    for (let i = 0; i < inputs.length; i += 1) {
        assert.equal(all[i].expression, inputs[i].expression);
        assert.equal(all[i].result, inputs[i].result);
        assert.ok(all[i].timestamp instanceof Date);
    }
});
