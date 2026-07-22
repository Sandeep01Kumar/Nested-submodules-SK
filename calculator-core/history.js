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
     * never exposed directly: getAll()/list() return a defensive shallow copy
     * so external callers cannot mutate it by pushing/splicing the returned
     * array.
     *
     * @type {Array<{ expression: string, result: number, timestamp: Date }>}
     */
    var entries = [];

    /**
     * Record a calculation into the history store.
     *
     * The supplied object is normalized into a NEW plain object of the
     * canonical shape `{ expression, result, timestamp }` before being stored,
     * decoupling the stored entry from the caller's object:
     *   - `expression` is coerced to a string via String(...); a missing /
     *     undefined expression becomes the empty string ''.
     *   - `result` is stored exactly as provided (as-is, no coercion).
     *   - `timestamp` is kept when the caller supplies a Date instance;
     *     otherwise it defaults to `new Date()` captured at record time.
     *
     * @param {{ expression?: *, result?: *, timestamp?: Date }} entry
     *        The calculation to record.
     * @returns {{ expression: string, result: number, timestamp: Date }}
     *          The normalized entry object that was stored.
     * @throws {TypeError} If `entry` is null or not an object.
     */
    function record(entry) {
        if (entry === null || typeof entry !== 'object') {
            throw new TypeError('history.record requires an entry object');
        }

        var normalized = {
            expression: entry.expression === undefined ? '' : String(entry.expression),
            result: entry.result,
            timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date()
        };

        entries.push(normalized);

        return normalized;
    }

    /**
     * Return every recorded entry.
     *
     * A shallow copy of the internal array is returned so callers cannot mutate
     * the internal store by pushing/splicing the returned array. Entries are in
     * insertion order (oldest first); the UI may reverse the copy for a
     * newest-first display.
     *
     * @returns {Array<{ expression: string, result: number, timestamp: Date }>}
     *          A shallow copy of the stored entries, oldest first.
     */
    function getAll() {
        return entries.slice();
    }

    /**
     * Alias of getAll(); provided because the AAP lists both names.
     *
     * @returns {Array<{ expression: string, result: number, timestamp: Date }>}
     *          A shallow copy of the stored entries, oldest first.
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
    return {
        record: record,
        getAll: getAll,
        list: list,
        clear: clear
    };
}));
