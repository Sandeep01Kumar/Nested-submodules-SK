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

    // -----------------------------------------------------------------------
    // Dependency validation (fail-fast — browser-bridge trust boundary; C-004).
    //
    // In Node the eight dependencies resolve via require() and are always
    // present. In the browser (no bundler) they are injected from EXTERNAL
    // globals — window.mathEngine.* and window.calculatorHistory — that this
    // factory does not own and cannot assume were preloaded correctly. Validate
    // every dependency HERE, before publishing any API, so a missing or
    // non-callable member fails IMMEDIATELY at initialization with a clear,
    // stable ERR_DEPENDENCY error that names the offending member — instead of
    // publishing a usable-looking `calculatorCore` whose first calculate() call
    // later dies with a generic "def.fn is not a function" (operations) or a raw
    // property-access TypeError (history).
    // -----------------------------------------------------------------------
    var REQUIRED_OPERATIONS = [
        ['add', add], ['subtract', subtract], ['multiply', multiply],
        ['divide', divide], ['modulus', modulus], ['power', power], ['sqrt', sqrt]
    ];
    for (var d = 0; d < REQUIRED_OPERATIONS.length; d++) {
        if (typeof REQUIRED_OPERATIONS[d][1] !== 'function') {
            var depErr = new Error(
                'calculator-core dependency missing or invalid: math-engine operation "' +
                REQUIRED_OPERATIONS[d][0] + '" is not a function'
            );
            depErr.code = 'ERR_DEPENDENCY';
            throw depErr;
        }
    }

    // Identity-collision guard (F1 defense-in-depth for the browser bridge).
    // The seven engine operations are seven DISTINCT one-function-per-file
    // modules, so no two should ever be the SAME function reference. If two are
    // identical, the browser bridge captured a STALE duplicate — e.g. a failed
    // modulus.js load leaving `modulus` pointing at the previously-loaded
    // `divide` — which a plain typeof check cannot detect (both look like
    // functions). Reject it here so a mis-captured operation fails CLOSED with a
    // structured ERR_DEPENDENCY instead of silently computing the wrong
    // arithmetic. In Node (require) the modules are always distinct, so this
    // never triggers on the tested path; it hardens the untrusted browser
    // globals. O(n^2) over a fixed n=7 — negligible, runs once at init.
    for (var x = 0; x < REQUIRED_OPERATIONS.length; x++) {
        for (var y = x + 1; y < REQUIRED_OPERATIONS.length; y++) {
            if (REQUIRED_OPERATIONS[x][1] === REQUIRED_OPERATIONS[y][1]) {
                var dupErr = new Error(
                    'calculator-core dependency invalid: math-engine operations "' +
                    REQUIRED_OPERATIONS[x][0] + '" and "' + REQUIRED_OPERATIONS[y][0] +
                    '" are the same function (a stale/duplicate bridge capture)'
                );
                dupErr.code = 'ERR_DEPENDENCY';
                throw dupErr;
            }
        }
    }

    if (history === null || typeof history !== 'object') {
        var historyErr = new Error(
            'calculator-core dependency missing or invalid: history store is not available'
        );
        historyErr.code = 'ERR_DEPENDENCY';
        throw historyErr;
    }
    var REQUIRED_HISTORY_METHODS = ['record', 'getAll', 'clear'];
    for (var h = 0; h < REQUIRED_HISTORY_METHODS.length; h++) {
        if (typeof history[REQUIRED_HISTORY_METHODS[h]] !== 'function') {
            var methodErr = new Error(
                'calculator-core dependency missing or invalid: history.' +
                REQUIRED_HISTORY_METHODS[h] + ' is not a function'
            );
            methodErr.code = 'ERR_DEPENDENCY';
            throw methodErr;
        }
    }

    // Capture TRUSTED references to the validated history methods at
    // initialization. calculate()/getHistory()/clearHistory() invoke these
    // captured references — NOT `history.record`/`.getAll`/`.clear` re-read at
    // call time — so even if a consumer could swap a method on the history
    // object after load, the facade still routes every record/read/clear to the
    // real, original store. history.js additionally freezes its exported API
    // object as defense in depth. Its methods are closure-based (they close over
    // the private entries array and use no `this`), so capturing the bare
    // function references is safe and preserves their behavior exactly.
    var recordHistory = history.record;
    var getAllHistory = history.getAll;
    var clearHistoryStore = history.clear;

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
     *   1. Resolve `operator` (canonical symbol OR alias) via the dispatch map.
     *      A non-string operator, or an unrecognized string, throws an
     *      ERR_UNKNOWN_OPERATOR error. Non-string operators are rejected WITHOUT
     *      being coerced (so an object's toString() can never be invoked to
     *      forge a valid key, and a Symbol never triggers a raw TypeError).
     *   2. Verify that enough operands were supplied for the operator's arity;
     *      too few throws an ERR_ARITY error. Extra operands beyond the arity are
     *      ignored (minimum-arity policy).
     *   3. Delegate the computation to the math-engine function. The engine
     *      guards invalid work (divide/modulus by zero, square root of a
     *      negative, non-finite operands) by THROWING; those surface here as
     *      structured errors — never as a silent NaN/Infinity (constraint
     *      C-004). The original message is preserved verbatim and the original
     *      error is attached as `.cause`.
     *   3b. Guard the RESULT: the value returned by the operation must be a
     *      finite number. A non-number or non-finite result (possible only via
     *      the browser bridge, where the operation functions are external and
     *      untrusted) throws ERR_OPERATION before anything is recorded (C-004).
     *   4. Build the canonical display expression (aliases normalize to the
     *      symbol): binary -> "a <symbol> b"; unary sqrt -> "√(a)".
     *   5. Record { expression, result, timestamp } to history — SUCCESS ONLY,
     *      via the captured, trusted history.record reference.
     *   6. Return the numeric result.
     *
     * @param {string} operator   Operator symbol or alias (e.g. '+', 'add', '√').
     * @param {...number} operands Operand(s): 2 for binary, 1 for unary sqrt.
     * @returns {number}          The computed numeric result.
     * @throws {Error} ERR_UNKNOWN_OPERATOR when `operator` is not a string, or is
     *                                       a string that is not recognized.
     * @throws {Error} ERR_ARITY            when too few operands are supplied.
     * @throws {Error} ERR_OPERATION        when the engine rejects the operands
     *                                       (message forwarded from the engine,
     *                                       original error kept as `.cause`), or
     *                                       when the operation yields a
     *                                       non-finite result.
     */
    function calculate(operator) {
        // Operand COUNT is derived from arguments.length in O(1); the variadic
        // arguments are NEVER copied into an array. Only the one or two operands
        // an operator actually needs are read (directly, by index), so both the
        // work and the memory this facade uses stay O(1) regardless of how many
        // extra operands a caller supplies.
        var operandCount = arguments.length - 1;

        // 1. Resolve the operator (canonical symbol or alias).
        //
        //    The operator MUST be a string. Property-key access would otherwise
        //    COERCE a non-string key: an object whose toString() returns '+'
        //    would silently execute addition (CWE-20 improper input validation),
        //    and a Symbol would raise a raw, unstructured TypeError from string
        //    concatenation. Reject every non-string up front with a structured
        //    ERR_UNKNOWN_OPERATOR — WITHOUT coercing the attacker-controlled
        //    value (the message reports only its typeof, never String(value)).
        if (typeof operator !== 'string') {
            var typeErr = new Error('Unknown operator: expected a string but received ' + (typeof operator));
            typeErr.code = 'ERR_UNKNOWN_OPERATOR';
            throw typeErr;
        }

        var def = DISPATCH[operator];
        if (!def) {
            var unknownErr = new Error('Unknown operator: ' + operator);
            unknownErr.code = 'ERR_UNKNOWN_OPERATOR';
            throw unknownErr;
        }

        // 2. Arity check — reject calls with too few operands up front. Extra
        //    operands beyond the operator's arity are ignored (minimum-arity
        //    policy), never copied.
        if (operandCount < def.arity) {
            var arityErr = new Error('Operator "' + operator + '" expects ' + def.arity + ' operand(s)');
            arityErr.code = 'ERR_ARITY';
            throw arityErr;
        }

        // Read ONLY the operands this operator needs, directly from `arguments`
        // (O(1)). `b` is read unconditionally (it is simply `undefined` for the
        // unary operator, which never uses it) to keep the access pattern flat.
        var a = arguments[1];
        var b = arguments[2];

        // 3. Compute via the math-engine. Engine modules throw structured
        //    Error objects for invalid work; re-surface them with operator
        //    context and a stable `.code`, preserving the original message so a
        //    caller never receives a silent NaN/Infinity (constraint C-004).
        var result;
        try {
            result = def.arity === 1
                ? def.fn(a)
                : def.fn(a, b);
        } catch (opError) {
            var opMessage = (opError && opError.message) ? opError.message : String(opError);
            var wrapped = new Error(opMessage, { cause: opError });
            wrapped.code = (opError && opError.code) ? opError.code : 'ERR_OPERATION';
            wrapped.operator = def.symbol;
            throw wrapped;
        }

        // 3b. Facade-level finite-result guard (constraint C-004; defense in
        //     depth). In Node the engine modules already guard their own result
        //     domain, but in the browser bridge the operation functions come
        //     from an external global (window.mathEngine) that this facade does
        //     NOT own. A dependency that returns a non-number, or a non-finite
        //     number (NaN/Infinity), must NEVER escape as a "successful" result
        //     nor be recorded to history. Enforce the numeric, finite contract
        //     HERE — immediately after the operation call, before building the
        //     expression or recording — by throwing a structured ERR_OPERATION.
        if (typeof result !== 'number' || !Number.isFinite(result)) {
            var resultErr = new Error('Result is not a finite number');
            resultErr.code = 'ERR_OPERATION';
            resultErr.operator = def.symbol;
            throw resultErr;
        }

        // 4. Build the canonical display expression (an alias normalizes to its
        //    symbol because `def.symbol` is always the canonical token).
        var expression = def.arity === 1
            ? def.symbol + '(' + a + ')'
            : a + ' ' + def.symbol + ' ' + b;

        // 5. Record to history ON SUCCESS ONLY (every failure path above throws
        //    before here, so failed computations are never recorded). The
        //    captured, TRUSTED `recordHistory` reference is used so a swapped
        //    `history.record` cannot intercept the entry.
        recordHistory({
            expression: expression,
            result: result,
            timestamp: new Date()
        });

        // 6. Return the numeric result.
        return result;
    }

    /**
     * Convenience delegator: return every recorded history entry so the UI has a
     * single import surface. `history.js` remains independently consumable.
     *
     * Delegates to history.getAll(), which returns a FRESH array of FROZEN,
     * DEEP-CLONED entry snapshots (each entry object is Object.freeze()d and its
     * `timestamp` is a newly-cloned Date), in insertion order (oldest first).
     * Callers therefore cannot mutate the internal store by pushing/splicing the
     * returned array, reassigning an entry's fields, or mutating a returned Date
     * (finding F11: the previous "shallow copy" wording did not match this
     * deep-cloned, frozen behavior).
     *
     * @returns {Array<Readonly<{ expression: string, result: number, timestamp: Date }>>}
     *          A fresh array of frozen, deep-cloned entry snapshots, oldest first.
     */
    function getHistory() {
        return getAllHistory();
    }

    /**
     * Convenience delegator: clear all recorded history entries.
     *
     * @returns {undefined}
     */
    function clearHistory() {
        return clearHistoryStore();
    }

    // Public API surface consumed by calculator-ui (and node:test).
    return {
        calculate: calculate,
        OPERATORS: OPERATORS,
        getHistory: getHistory,
        clearHistory: clearHistory
    };
}));
