/**
 * calculator-core/history.js
 *
 * In-memory Calculation History API (PR 3 · calculator-core).
 *
 * Provides a tiny, session-scoped store of calculation-history entries. It is
 * consumed by:
 *   - calculator-core/calculator.js (the facade), which calls record(...) on
 *     every successful computation, and
 *   - the sibling calculator-ui layer, which calls getAll()/list() to render
 *     the History panel and clear() for the "Clear History" button.
 *
 * There is NO database or persistence layer. History lives only in memory for
 * the lifetime of the module (session). No localStorage, files, or other I/O
 * are used here — that is intentionally out of scope.
 *
 * Data model — every stored entry is a plain object of the exact shape:
 *   { expression: string, result: number, timestamp: Date }
 *
 * Module system — this file is authored as a UMD-style dual export so the same
 * source works verbatim in Node (CommonJS `require`, used by node:test) and in
 * the browser (attached to the global as `calculatorHistory`). It has zero
 * third-party dependencies and imports nothing.
 *
 * Singleton store — the internal `entries` array is a module-level singleton:
 * every `require('./history')` within the same Node process shares ONE array
 * (the facade records; the UI reads). Tests must therefore call clear() in a
 * beforeEach hook to stay isolated.
 */
(function (root, factory) {
    'use strict';

    // Build the API once, then bind it to the appropriate environment.
    var api = factory();

    if (typeof module === 'object' && module.exports) {
        // Node.js / node:test — expose via CommonJS require().
        module.exports = api;
    } else {
        // Browser (no bundler) — expose as a global for calculator-ui.
        // The global name MUST be exactly `calculatorHistory`.
        root.calculatorHistory = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    /**
     * Internal, module-level history store.
     *
     * Entries are held in insertion order (oldest first). This array is a
     * singleton shared by all consumers within the same runtime/process and is
     * never exposed directly. Every entry stored here is a private object whose
     * `timestamp` is a Date instance owned solely by this module (a clone of any
     * caller-supplied Date). record()/getAll()/list() never hand out these
     * internal objects or their Dates — they return frozen, deep-cloned
     * snapshots (see snapshot()) so external callers can neither reassign an
     * entry's fields nor mutate a returned timestamp to corrupt later reads.
     *
     * @type {Array<{ expression: string, result: number, timestamp: Date }>}
     */
    var entries = [];

    /**
     * Build a frozen, deep-cloned snapshot of a stored entry for hand-off to
     * callers. The returned object is a NEW plain object carrying a NEW Date
     * (cloned from the stored Date's instant), then Object.freeze()d. This is
     * the single choke point that guarantees mutation isolation (findings F2/F6):
     * mutating a returned entry — including calling setUTCFullYear() on its
     * timestamp — can never reach the internal store, and every call yields an
     * independent copy. `expression` (a string) and `result` are copied by
     * value; that is fully isolating because record() guarantees `result` is a
     * finite PRIMITIVE number (finding F2), so there is no shared object
     * reference to leak, and `timestamp` is re-cloned as a fresh Date.
     *
     * @param {{ expression: string, result: number, timestamp: Date }} entry
     *        An internally-stored entry.
     * @returns {Readonly<{ expression: string, result: number, timestamp: Date }>}
     *          A frozen, independent snapshot.
     */
    function snapshot(entry) {
        return Object.freeze({
            expression: entry.expression,
            result: entry.result,
            timestamp: new Date(entry.timestamp.getTime())
        });
    }

    /**
     * Record a calculation into the history store.
     *
     * The supplied object is normalized into a NEW private object of the
     * canonical shape `{ expression, result, timestamp }` before being stored,
     * fully decoupling the stored entry from the caller's object:
     *   - `expression` is coerced to a string via String(...); a missing /
     *     undefined expression becomes the empty string ''.
     *   - `result` MUST be a finite primitive number — the documented entry data
     *     model (history.js §3, AAP §0.2.3). A non-number, or a non-finite
     *     number (NaN / Infinity / -Infinity), is REJECTED with a TypeError; it
     *     is never coerced and never stored (finding F2). Enforcing a finite
     *     PRIMITIVE here is also what makes the store's mutation isolation real:
     *     snapshot() copies `result` by value, which is safe only for a
     *     primitive — a non-primitive result (e.g. `{ amount: 1 }`) would
     *     otherwise be shared by reference and let a later caller-side mutation
     *     corrupt earlier reads.
     *   - `timestamp` is DEEP-CLONED when the caller supplies a VALID Date
     *     instance (one whose getTime() is finite): a new Date of the same
     *     instant is stored, so later mutation of the caller's Date cannot reach
     *     the store. A missing timestamp — or a supplied but INVALID Date whose
     *     getTime() is NaN (e.g. `new Date('not-a-date')`) — defaults to
     *     `new Date()` captured at record time, so an "Invalid Date" can never
     *     enter the store (finding F6).
     *
     * The return value is a frozen, deep-cloned snapshot of the stored entry
     * (see snapshot()), NOT the internal object — so mutating it (including its
     * timestamp) cannot corrupt the store (finding F6).
     *
     * @param {{ expression?: *, result: number, timestamp?: Date }} entry
     *        The calculation to record. `result` is required and must be a
     *        finite primitive number.
     * @returns {Readonly<{ expression: string, result: number, timestamp: Date }>}
     *          A frozen, deep-cloned snapshot of the stored entry.
     * @throws {TypeError} If `entry` is null or not an object, or if
     *         `entry.result` is not a finite primitive number (finding F2).
     */
    function record(entry) {
        if (entry === null || typeof entry !== 'object') {
            throw new TypeError('history.record requires an entry object');
        }

        // Enforce the documented result model (history.js §3): a finite PRIMITIVE
        // number. Reject — never coerce — anything else (an object/array, a
        // string, a boolean, null, undefined, or a non-finite NaN/Infinity)
        // BEFORE mutating the store, so an invalid or mutable result can never be
        // pushed and can never reach getAll()/list() or the UI (finding F2). The
        // `typeof` guard also rejects a boxed `new Number(1)` object, keeping the
        // stored value a true primitive that snapshot() can safely copy by value.
        if (typeof entry.result !== 'number' || !Number.isFinite(entry.result)) {
            throw new TypeError('history.record requires a finite number result');
        }

        // A caller-supplied Date is accepted only when it represents a real
        // instant (getTime() is finite); an INVALID Date (getTime() is NaN) is
        // treated like an absent timestamp and defaults to now, so "Invalid Date"
        // never enters the store (finding F6).
        var hasValidDate = entry.timestamp instanceof Date && Number.isFinite(entry.timestamp.getTime());

        // Store a NEW private object. A valid caller-supplied Date is deep-cloned
        // (a fresh Date of the same instant) so that later mutation of the
        // caller's own Date instance cannot reach into the store.
        var stored = {
            expression: entry.expression === undefined ? '' : String(entry.expression),
            result: entry.result,
            timestamp: hasValidDate ? new Date(entry.timestamp.getTime()) : new Date()
        };

        entries.push(stored);

        // Hand back a frozen, deep-cloned snapshot — never the internal object.
        return snapshot(stored);
    }

    /**
     * Return every recorded entry.
     *
     * Returns a NEW array of frozen, deep-cloned snapshots (each entry and its
     * Date timestamp is cloned via snapshot()), so callers can neither mutate
     * the internal store by pushing/splicing the returned array nor corrupt a
     * stored entry by writing to a returned entry or its timestamp (finding F6).
     * Entries are in insertion order (oldest first); the UI may reverse the
     * returned array for a newest-first display.
     *
     * @returns {Array<Readonly<{ expression: string, result: number, timestamp: Date }>>}
     *          A fresh array of frozen, deep-cloned entry snapshots, oldest first.
     */
    function getAll() {
        return entries.map(snapshot);
    }

    /**
     * Alias of getAll(); provided because the AAP lists both names.
     *
     * @returns {Array<Readonly<{ expression: string, result: number, timestamp: Date }>>}
     *          A fresh array of frozen, deep-cloned entry snapshots, oldest first.
     */
    function list() {
        return getAll();
    }

    /**
     * Remove all entries from the history store.
     *
     * Resets the internal array to a new empty array so subsequent getAll() /
     * list() calls report an empty history.
     *
     * @returns {undefined}
     */
    function clear() {
        entries = [];
        return undefined;
    }

    // Public API surface consumed by calculator.js and calculator-ui.
    //
    // The API object itself is FROZEN (not only the per-entry snapshots) so a
    // consumer cannot REPLACE a method after load — e.g. `history.record = fn`
    // to intercept every subsequent facade computation and divert entries away
    // from the real store, corrupting shared-state integrity. Under the module's
    // 'use strict' such a reassignment throws a TypeError instead of silently
    // succeeding. Combined with the facade capturing its own trusted method
    // references at initialization (see calculator.js), the record/getAll/clear
    // surface can never be swapped out from under the facade.
    return Object.freeze({
        record: record,
        getAll: getAll,
        list: list,
        clear: clear
    });
}));
