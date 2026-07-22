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
 *     node --test                                   # run the whole suite from the repo root
 *     node --test calculator-core/history.test.js   # run just this file
 *
 * (Note: `node --test calculator-core/` — a bare directory argument — is NOT a
 * valid invocation on this runtime; Node tries to load the directory as a
 * module and fails with MODULE_NOT_FOUND. Use the repo-root form above, or pass
 * explicit test files / a glob such as `node --test "calculator-core/**\/*.test.js"`.)
 *
 * Isolation note: history.js keeps its entries in a MODULE-LEVEL SINGLETON
 * array that is shared by every require('./history') within the same Node
 * process. A `beforeEach` hook therefore clears the store before every test so
 * the cases stay independent and order-agnostic (never flaky).
 *
 * The `history.js` contract exercised here (see history.js §4):
 *   - record(entry)  -> normalizes to { expression:string, result:*, timestamp:Date },
 *                        stores a PRIVATE object (a caller-supplied Date is DEEP-CLONED),
 *                        and returns a FROZEN, deep-cloned snapshot of it. A missing
 *                        `expression` becomes ''; a non-string expression is String()-coerced;
 *                        a non-Date `timestamp` defaults to new Date(). Throws TypeError
 *                        when `entry` is null / not an object.
 *   - getAll()       -> a NEW array of FROZEN, deep-cloned snapshots (fresh entry objects
 *                        AND fresh Date clones), oldest-first insertion order.
 *   - list()         -> alias of getAll().
 *   - clear()        -> empties the store, returns undefined.
 *
 * Mutation isolation (finding F6): a caller can NEVER corrupt the store by writing to a
 * returned entry, reassigning its fields (snapshots are frozen), mutating a returned Date
 * (e.g. setUTCFullYear), or mutating a Date it passed to record() after the call.
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

// Case 3 — record preserves a provided Date timestamp BY VALUE (deep-cloned).
// The instant is preserved, but the stored/returned Date is an independent clone,
// NOT the caller's instance (finding F6 — no shared mutable reference).
test('record preserves a provided Date timestamp by value as an independent clone', () => {
    const t = new Date('2020-01-01T00:00:00Z');
    const stored = history.record({ expression: 'fixed timestamp', result: 1, timestamp: t });

    // Same instant is preserved...
    assert.equal(stored.timestamp.getTime(), t.getTime());
    // ...but the returned Date is a CLONE, not the caller's instance.
    assert.notStrictEqual(stored.timestamp, t);

    // The entry retrievable via getAll() also matches by instant and is itself a
    // fresh, independent clone.
    const all = history.getAll();
    assert.equal(all[0].timestamp.getTime(), t.getTime());
    assert.notStrictEqual(all[0].timestamp, t);
    assert.notStrictEqual(all[0].timestamp, stored.timestamp);
});

// Case 4 — record returns a normalized snapshot that equals the getAll() element
// BY VALUE, but is an independent, frozen object (not the same reference).
test('record returns a normalized snapshot equal by value to the getAll() element', () => {
    const stored = history.record({ expression: '7 * 6', result: 42 });

    // The return value exposes the canonical shape...
    assert.ok(Object.prototype.hasOwnProperty.call(stored, 'expression'));
    assert.ok(Object.prototype.hasOwnProperty.call(stored, 'result'));
    assert.ok(Object.prototype.hasOwnProperty.call(stored, 'timestamp'));

    const all = history.getAll();
    assert.equal(all.length, 1);

    // Deep VALUE equality with the entry retrievable via getAll()...
    assert.deepStrictEqual(all[0], stored);
    // ...but they are independent defensive snapshots, not the same reference.
    assert.notStrictEqual(all[0], stored);
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

// Case 8 — getAll() returns a defensive array copy: mutating the returned array
// (push/pop/splice) must NOT corrupt the internal store.
test('getAll() returns a defensive array copy that cannot mutate the store', () => {
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

// Case 10 (F7) — record() rejects null / non-object entries with a TypeError and
// the exact documented message (public guard was previously untested).
test('record throws TypeError with exact message for null / non-object entries', () => {
    const bad = [null, undefined, 42, '2 + 3', true, Symbol('s')];
    for (const value of bad) {
        assert.throws(
            () => history.record(value),
            { name: 'TypeError', message: 'history.record requires an entry object' }
        );
    }
});

// Case 11 (F7) — expression normalization: a missing/undefined expression becomes
// '', and any non-string expression is String()-coerced (previously only an
// already-normalized string was exercised).
test('record normalizes the expression field (String coercion; undefined -> "")', () => {
    const cases = [
        { entry: { result: 1 }, expected: '' },                                    // missing -> ''
        { entry: { expression: undefined, result: 1 }, expected: '' },             // undefined -> ''
        { entry: { expression: 42, result: 1 }, expected: '42' },                  // number -> '42'
        { entry: { expression: null, result: 1 }, expected: 'null' },              // null -> 'null'
        { entry: { expression: true, result: 1 }, expected: 'true' },              // boolean -> 'true'
        { entry: { expression: { toString() { return 'X'; } }, result: 1 }, expected: 'X' }, // object -> String()
        { entry: { expression: '5 + 5', result: 10 }, expected: '5 + 5' }          // string -> unchanged
    ];
    for (const { entry, expected } of cases) {
        const stored = history.record(entry);
        assert.equal(stored.expression, expected);
        assert.equal(typeof stored.expression, 'string');
    }
});

// Case 12 (F7) — non-Date timestamp defaulting: any non-Date `timestamp`
// (number, string, null, object, boolean) is ignored and defaults to a fresh
// Date captured at record time (previously untested).
test('record defaults a non-Date timestamp to a fresh Date', () => {
    const nonDates = [12345, '2020-01-01T00:00:00Z', null, {}, true];
    for (const ts of nonDates) {
        const before = Date.now();
        const stored = history.record({ expression: 't', result: 1, timestamp: ts });
        const after = Date.now();
        assert.ok(stored.timestamp instanceof Date);
        assert.ok(stored.timestamp.getTime() >= before);
        assert.ok(stored.timestamp.getTime() <= after);
    }
});

// Case 13 (F6/F7) — mutation isolation via record()'s return value: the snapshot
// is frozen (fields cannot be reassigned) and mutating its Date clone cannot
// corrupt the store.
test('mutation isolation: the record() return is frozen and its Date is isolated', () => {
    const returned = history.record({ expression: 'iso', result: 1 });

    // The snapshot is frozen — reassigning a field throws in strict mode.
    assert.ok(Object.isFrozen(returned));
    assert.throws(() => { returned.result = 999; }, TypeError);

    // Mutating the returned Date clone (the exact vector from F6) must not reach
    // the store.
    returned.timestamp.setUTCFullYear(1900);
    assert.notEqual(history.getAll()[0].timestamp.getUTCFullYear(), 1900);
});

// Case 14 (F6/F7) — mutation isolation via getAll(): mutating a returned entry's
// Date must not corrupt the store, and every call yields independent clones.
test('mutation isolation: mutating a getAll() entry Date does not corrupt the store', () => {
    history.record({ expression: 'iso2', result: 2 });

    const first = history.getAll()[0];
    assert.ok(Object.isFrozen(first));
    first.timestamp.setUTCFullYear(1900);

    // A subsequent read is a fresh clone, unaffected by the earlier mutation.
    const second = history.getAll()[0];
    assert.notEqual(second.timestamp.getUTCFullYear(), 1900);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.timestamp, second.timestamp);
});

// Case 15 (F6/F7) — mutation isolation of the caller's own Date: mutating the
// Date passed to record() AFTER the call must not change the stored instant
// (history.js deep-clones the supplied Date on the way in).
test('mutation isolation: mutating the caller-supplied Date after record does not corrupt the store', () => {
    const t = new Date('2020-06-15T12:00:00Z');
    history.record({ expression: 'iso3', result: 3, timestamp: t });

    t.setUTCFullYear(1900); // mutate the caller's original Date after recording

    assert.equal(history.getAll()[0].timestamp.getUTCFullYear(), 2020);
});
