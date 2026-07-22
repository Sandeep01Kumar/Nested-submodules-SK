/**
 * calculator-core/calculator.js
 *
 * Operations Facade — a unified `calculate()` over the math-engine, with
 * structured error handling and automatic calculation-history recording
 * (PR 3 · calculator-core: "Integrate new math-engine features and history
 * management").
 *
 * ROLE
 * ----
 * This module is the calculator-core "service layer". It is the single seam
 * that wires the low-level arithmetic engine (calculator-core/math-engine/*)
 * to the in-memory history store (calculator-core/history.js) and exposes one
 * clean interface for every caller (Node's node:test today, the calculator-ui
 * layer in the browser):
 *
 *     calculate(operator, ...operands) -> number   (records history on success)
 *     OPERATORS                        -> Array<{ symbol, arity, label }>
 *     getHistory()                     -> Array<entry>   (delegates to history)
 *     clearHistory()                   -> void           (delegates to history)
 *
 * DESIGN CONTRACTS
 * ----------------
 * - No arithmetic is implemented here. Every computation is delegated to a
 *   one-function-per-file math-engine module; this facade only resolves the
 *   operator, validates arity, builds the display expression, records history,
 *   and returns/raises the result (AAP §0.7: "no arithmetic may be
 *   duplicated").
 * - Structured errors (constraint C-004): callers NEVER receive a silent
 *   NaN/Infinity. Unknown operators, missing operands, and invalid arithmetic
 *   all throw real Error objects carrying a stable string `.code`
 *   ('ERR_UNKNOWN_OPERATOR', 'ERR_ARITY', 'ERR_OPERATION').
 * - History is recorded ONLY on a successful computation, as the canonical
 *   entry shape { expression, result, timestamp }.
 * - Zero third-party dependencies (constraint C-001): this file requires only
 *   its local sibling modules.
 *
 * MODULE SYSTEM (UMD dual export, constraint C-002)
 * -------------------------------------------------
 * The same source runs in Node (CommonJS `require`, exercised by node:test —
 * the authoritative, tested path) and in the browser with NO bundler. In the
 * browser the calculator-ui layer is responsible for preloading the engine and
 * history on the global namespace BEFORE this script executes:
 *
 *     window.mathEngine = { add, subtract, multiply, divide,
 *                           modulus, power, sqrt };   // one-fn-per-file ops
 *     // history.js self-registers window.calculatorHistory when loaded.
 *
 * This module then publishes itself as the global `calculatorCore`. Keeping
 * the engine modules as pure CommonJS one-function-per-file units (unchanged)
 * while bridging to the browser via globals avoids introducing any bundler.
 */
(function (root, factory) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        // Node.js / node:test — CommonJS. This is the authoritative path that
        // the unit tests exercise; every dependency resolves via require().
        module.exports = factory(
            require('./math-engine/add'),
            require('./math-engine/subtract'),
            require('./math-engine/multiply'),
            require('./math-engine/divide'),
            require('./math-engine/modulus'),
            require('./math-engine/power'),
            require('./math-engine/sqrt'),
            require('./history')
        );
    } else {
        // Browser (no bundler) — dependencies MUST be preloaded on the global
        // namespace by the calculator-ui layer before this script runs (see the
        // module header). The published global name MUST be exactly
        // `calculatorCore`.
        var me = root.mathEngine || {};
        root.calculatorCore = factory(
            me.add, me.subtract, me.multiply, me.divide,
            me.modulus, me.power, me.sqrt,
            root.calculatorHistory
        );
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this),
function (add, subtract, multiply, divide, modulus, power, sqrt, history) {
    'use strict';

    /**
     * Ordered, single-source-of-truth operator definitions.
     *
     * Every downstream structure — the dispatch map used by calculate() and
     * the public OPERATORS descriptor array — is derived from this one list, so
     * the set of supported operators is declared exactly once.
     *
     * - `symbol`  : canonical operator symbol used in expressions and history.
     * - `arity`   : operand count (2 = binary, 1 = unary).
     * - `label`   : human-friendly name for UI buttons.
     * - `fn`      : the delegated math-engine function.
     * - `aliases` : additional string tokens accepted by calculate() and
     *               normalized to `symbol`.
     *
     * @type {Array<{ symbol: string, arity: number, label: string,
     *                fn: Function, aliases: string[] }>}
     */
    var OPERATOR_DEFS = [
        { symbol: '+', arity: 2, label: 'Add',         fn: add,      aliases: ['add'] },
        { symbol: '-', arity: 2, label: 'Subtract',    fn: subtract, aliases: ['subtract'] },
        { symbol: '*', arity: 2, label: 'Multiply',    fn: multiply, aliases: ['multiply'] },
        { symbol: '/', arity: 2, label: 'Divide',      fn: divide,   aliases: ['divide'] },
        { symbol: '%', arity: 2, label: 'Modulus',     fn: modulus,  aliases: ['modulus', 'mod'] },
        { symbol: '^', arity: 2, label: 'Power',       fn: power,    aliases: ['power', 'pow', '**'] },
        { symbol: '\u221a', arity: 1, label: 'Square root', fn: sqrt, aliases: ['sqrt'] }
    ];

    /**
     * Dispatch map keyed by BOTH the canonical symbol and every alias, each
     * mapping to its operator definition. Built on a null-prototype object so
     * lookups cannot accidentally match inherited members such as 'constructor'
     * or 'toString' — those correctly resolve to "unknown operator".
     *
     * @type {Object<string, object>}
     */
    var DISPATCH = Object.create(null);

    /**
     * Public, UI-friendly operator descriptors: one frozen
     * { symbol, arity, label } per operator, in definition order. Consumed by
     * calculator-ui to render operator buttons and to know each operator's
     * arity (how many operands it needs).
     *
     * @type {ReadonlyArray<{ symbol: string, arity: number, label: string }>}
     */
    var OPERATORS = [];

    // Build the dispatch map and the public descriptor array from the single
    // source of truth above. Runs once at module load; O(number of operators).
    (function buildDispatchAndDescriptors() {
        for (var i = 0; i < OPERATOR_DEFS.length; i++) {
            var def = OPERATOR_DEFS[i];

            // Register the canonical symbol and each alias in the dispatch map.
            DISPATCH[def.symbol] = def;
            for (var j = 0; j < def.aliases.length; j++) {
                DISPATCH[def.aliases[j]] = def;
            }

            // Expose an immutable public descriptor (without fn/aliases).
            OPERATORS.push(Object.freeze({
                symbol: def.symbol,
                arity: def.arity,
                label: def.label
            }));
        }
    }());

    // Freeze the public array so the descriptor contract cannot be mutated by
    // consumers (each descriptor object is already frozen above).
    Object.freeze(OPERATORS);

    /**
     * Compute a single arithmetic operation and record it to history.
     *
     * Behavior (executed strictly in this order):
     *   1. Resolve `operator` (canonical symbol OR alias) via the dispatch map;
     *      an unrecognized operator throws an ERR_UNKNOWN_OPERATOR error.
     *   2. Verify that enough operands were supplied for the operator's arity;
     *      too few throws an ERR_ARITY error.
     *   3. Delegate the computation to the math-engine function. The engine
     *      guards invalid work (divide/modulus by zero, square root of a
     *      negative, non-finite operands) by THROWING; those surface here as
     *      structured errors — never as a silent NaN/Infinity (constraint
     *      C-004). The original message is preserved verbatim and the original
     *      error is attached as `.cause`.
     *   4. Build the canonical display expression (aliases normalize to the
     *      symbol): binary -> "a <symbol> b"; unary sqrt -> "√(a)".
     *   5. Record { expression, result, timestamp } to history — SUCCESS ONLY.
     *   6. Return the numeric result.
     *
     * @param {string} operator   Operator symbol or alias (e.g. '+', 'add', '√').
     * @param {...number} operands Operand(s): 2 for binary, 1 for unary sqrt.
     * @returns {number}          The computed numeric result.
     * @throws {Error} ERR_UNKNOWN_OPERATOR when `operator` is not recognized.
     * @throws {Error} ERR_ARITY            when too few operands are supplied.
     * @throws {Error} ERR_OPERATION        when the engine rejects the operands
     *                                       (message forwarded from the engine,
     *                                       original error kept as `.cause`).
     */
    function calculate(operator) {
        // Operands are every argument after `operator`. Collecting them from
        // `arguments` keeps this function plain ES5 (matching the engine and
        // history modules) so it needs no transpilation for the browser bridge.
        var operands = Array.prototype.slice.call(arguments, 1);

        // 1. Resolve the operator (canonical symbol or alias).
        var def = DISPATCH[operator];
        if (!def) {
            var unknownErr = new Error('Unknown operator: ' + operator);
            unknownErr.code = 'ERR_UNKNOWN_OPERATOR';
            throw unknownErr;
        }

        // 2. Arity check — reject calls with too few operands up front.
        if (operands.length < def.arity) {
            var arityErr = new Error('Operator "' + operator + '" expects ' + def.arity + ' operand(s)');
            arityErr.code = 'ERR_ARITY';
            throw arityErr;
        }

        // 3. Compute via the math-engine. Engine modules throw structured
        //    Error objects for invalid work; re-surface them with operator
        //    context and a stable `.code`, preserving the original message so a
        //    caller never receives a silent NaN/Infinity (constraint C-004).
        var result;
        try {
            result = def.arity === 1
                ? def.fn(operands[0])
                : def.fn(operands[0], operands[1]);
        } catch (opError) {
            var opMessage = (opError && opError.message) ? opError.message : String(opError);
            var wrapped = new Error(opMessage, { cause: opError });
            wrapped.code = (opError && opError.code) ? opError.code : 'ERR_OPERATION';
            wrapped.operator = def.symbol;
            throw wrapped;
        }

        // 4. Build the canonical display expression (an alias normalizes to its
        //    symbol because `def.symbol` is always the canonical token).
        var expression = def.arity === 1
            ? def.symbol + '(' + operands[0] + ')'
            : operands[0] + ' ' + def.symbol + ' ' + operands[1];

        // 5. Record to history ON SUCCESS ONLY (steps 1–3 throw before here on
        //    any failure, so failed computations are never recorded).
        history.record({
            expression: expression,
            result: result,
            timestamp: new Date()
        });

        // 6. Return the numeric result.
        return result;
    }

    /**
     * Convenience delegator: return every recorded history entry (a defensive
     * shallow copy, oldest first) so the UI has a single import surface.
     * `history.js` remains independently consumable.
     *
     * @returns {Array<{ expression: string, result: number, timestamp: Date }>}
     *          A shallow copy of the stored history entries.
     */
    function getHistory() {
        return history.getAll();
    }

    /**
     * Convenience delegator: clear all recorded history entries.
     *
     * @returns {undefined}
     */
    function clearHistory() {
        return history.clear();
    }

    // Public API surface consumed by calculator-ui (and node:test).
    return {
        calculate: calculate,
        OPERATORS: OPERATORS,
        getHistory: getHistory,
        clearHistory: clearHistory
    };
}));
