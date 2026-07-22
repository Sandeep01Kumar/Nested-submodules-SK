'use strict';

/*
 * calculator-ui/app.js
 *
 * Calculator UI Controller (PR 1 · calculator-ui: "Add calculation history UI
 * and input validation").
 *
 * ROLE
 * ----
 * This is the browser-side controller that makes the static markup in
 * index.html interactive. It owns exactly four responsibilities and performs
 * NO arithmetic of its own:
 *
 *   1. Operator selection  - highlight the chosen `.op-btn` and remember it.
 *   2. Input validation    - reject empty / non-numeric / non-finite operands
 *                            BEFORE any computation, surfacing the reason in
 *                            the #error element (never only console.log).
 *   3. Computation         - delegate every calculation to the calculator-core
 *                            facade (window.calculatorCore.calculate); render
 *                            the numeric result or the structured error.
 *   4. History             - render the running calculation history
 *                            (newest-first) and clear it on demand.
 *
 * HARD CONSTRAINTS (AAP §0.5.2 PR1, agent prompt §2)
 * --------------------------------------------------
 * - Zero third-party dependencies (C-001): plain browser JavaScript only -
 *   no imports, no npm packages, no frameworks.
 * - No duplicated arithmetic (integration rule): ALL math flows through
 *   window.calculatorCore.calculate(...). This file never computes +, -, *,
 *   /, %, ^ or the square root itself.
 * - Classic script (NOT a module): loaded as <script src="app.js"></script>
 *   AFTER the calculator-core scripts, so window.calculatorCore and
 *   window.calculatorHistory already exist. No import/export is used.
 * - Numeric validation uses Number.isFinite, surfaces errors in the UI, and
 *   BLOCKS computation on invalid input.
 *
 * THE calculator-core CONTRACT THIS FILE CONSUMES (agent prompt §3)
 * ----------------------------------------------------------------
 * window.calculatorCore = {
 *   calculate(operator, ...operands) -> number
 *       operator is a canonical symbol: '+', '-', '*', '/', '%', '^', '√'.
 *       '+ - * / % ^' are binary (2 operands); '√' is unary (1 operand).
 *       Records { expression, result, timestamp } into history on SUCCESS
 *       ONLY, and THROWS a structured Error (never returns NaN/Infinity) for
 *       divide-by-zero, modulus-by-zero, square-root-of-negative, non-finite
 *       operands, unknown operator, or wrong arity.
 *   OPERATORS    -> ReadonlyArray<{ symbol, arity, label }>  (all 7 operators)
 *   getHistory() -> Array<{ expression, result, timestamp: Date }> (oldest first)
 *   clearHistory() -> void
 * }
 *
 * A-002: the engine rejects numeric STRINGS as non-finite operands, so this
 * controller always parses inputs into real numbers with Number(...) and only
 * ever passes numbers (never raw strings) to calculate().
 *
 * SHARED DOM CONTRACT (agent prompt §4 - must match index.html exactly)
 * --------------------------------------------------------------------
 * Reads/drives by id/class:
 *   #operand-a, #operand-b            operand <input> fields
 *   .op-btn (each data-op="SYMBOL")   operator buttons
 *   #equals                           compute trigger
 *   #result                           result display
 *   #error                            validation / error message region
 *   #history-list                     history <ul>
 *   #clear-history                    clear-history button
 * History items created here:
 *   <li class="history-item">
 *     <span class="history-expr">EXPR = RESULT</span>
 *     <span class="history-time">HH:MM:SS</span>
 *   </li>
 */
(function () {
    // Canonical symbol of the sole unary operator (square root). Used only as a
    // safe fallback for arity when window.calculatorCore.OPERATORS is somehow
    // unavailable; the authoritative arity always comes from the core.
    var UNARY_SQRT = '\u221a'; // the '√' symbol

    // The operator symbol currently chosen by the user (null until one is
    // selected). Set from a button's data-op attribute.
    var selectedOp = null;

    // DOM references - assigned once in init() (after the DOM is ready) and
    // closed over by every handler below.
    var operandA = null;
    var operandB = null;
    var equalsBtn = null;
    var resultEl = null;
    var errorEl = null;
    var historyList = null;
    var clearBtn = null;
    var opButtons = null;

    /*
     * Resolve the live calculator-core facade at call time (a lazy read) rather
     * than caching it at load. Reading window.calculatorCore on demand makes the
     * controller robust to script-ordering surprises: if the core is not present
     * yet, callers degrade gracefully (renderHistory no-ops; compute surfaces a
     * friendly error) instead of throwing.
     *
     * @returns {(object|undefined)} The calculator-core API object, or undefined.
     */
    function getCore() {
        return window.calculatorCore;
    }

    /*
     * Determine how many operands the given operator symbol needs.
     *
     * The authoritative source is core.OPERATORS (a { symbol, arity, label }
     * descriptor per operator). If that array is unavailable, fall back to the
     * known shape of this calculator: only the square root is unary (1); every
     * other operator is binary (2).
     *
     * @param {string} symbol Canonical operator symbol.
     * @returns {number} 1 for a unary operator, 2 for a binary operator.
     */
    function arityFor(symbol) {
        var core = getCore();
        if (core && Array.isArray(core.OPERATORS)) {
            for (var i = 0; i < core.OPERATORS.length; i++) {
                if (core.OPERATORS[i].symbol === symbol) {
                    return core.OPERATORS[i].arity;
                }
            }
        }
        return symbol === UNARY_SQRT ? 1 : 2;
    }

    /*
     * Show a message in the #error region (visible in the UI, per §2/§5 - never
     * only logged to the console). Blocks nothing on its own; callers return
     * after calling it to halt the compute flow.
     *
     * @param {string} msg The message to display.
     */
    function showError(msg) {
        if (errorEl) {
            errorEl.textContent = msg;
        }
    }

    /* Clear any message currently shown in the #error region. */
    function clearError() {
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    /*
     * Read and validate a single operand from an <input>.
     *
     * Validation (agent prompt §5.2): trim the raw string; an empty string is
     * invalid; otherwise parse with Number(...) and reject anything that is not
     * a finite number via Number.isFinite (this also rejects '', 'abc',
     * 'Infinity', and 'NaN'). Returning a plain { ok, value } result rather than
     * throwing lets compute() block cleanly and show a targeted message for the
     * common invalid-input case without a try/catch.
     *
     * @param {HTMLInputElement} inputEl The operand input to read.
     * @returns {{ ok: boolean, value?: number }} ok:false when invalid; ok:true
     *          with the parsed numeric value when valid.
     */
    function readOperand(inputEl) {
        var raw = (inputEl && inputEl.value ? inputEl.value : '').trim();
        if (raw === '') {
            return { ok: false };
        }
        var n = Number(raw);
        if (!Number.isFinite(n)) {
            return { ok: false };
        }
        return { ok: true, value: n };
    }

    /*
     * Select an operator: remember it, move the `.selected` highlight onto the
     * clicked button (clearing it from the others), and enable/disable the
     * second operand input according to the operator's arity - a unary operator
     * (√) has no second operand, so #operand-b is disabled and ignored, while
     * binary operators re-enable it.
     *
     * aria-pressed is kept in sync on every operator button so assistive
     * technology announces which operator is active. This is invisible
     * accessibility (zero visual impact) and never conflicts with the design.
     *
     * @param {string} symbol The chosen operator's canonical symbol (data-op).
     * @param {HTMLButtonElement} btn The button that was clicked.
     */
    function selectOperator(symbol, btn) {
        selectedOp = symbol;
        if (opButtons) {
            for (var i = 0; i < opButtons.length; i++) {
                var isSelected = (opButtons[i] === btn);
                opButtons[i].classList.toggle('selected', isSelected);
                opButtons[i].setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            }
        }
        if (operandB) {
            // Unary operators (arity 1) have no second operand.
            operandB.disabled = (arityFor(symbol) === 1);
        }
    }

    /*
     * Re-render the History panel from the calculator-core store.
     *
     * Reads window.calculatorCore.getHistory() (entries oldest-first), clears
     * #history-list, then appends one <li class="history-item"> per entry in
     * NEWEST-FIRST order (a reversed copy). Each item carries a `.history-expr`
     * span ("EXPR = RESULT") and a muted `.history-time` span (the timestamp
     * formatted with toLocaleTimeString()).
     *
     * The DOM is built exclusively with document.createElement + textContent -
     * never innerHTML with entry data - so a crafted expression/result can never
     * be interpreted as markup (defensive, injection-safe rendering).
     */
    function renderHistory() {
        if (!historyList) {
            return;
        }
        // Clear the list first so a re-render never duplicates rows.
        historyList.textContent = '';

        var core = getCore();
        if (!core || typeof core.getHistory !== 'function') {
            return;
        }

        // getHistory() returns oldest-first; copy and reverse for a newest-first
        // display without mutating the array the store handed back.
        var entries = core.getHistory().slice().reverse();
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];

            var li = document.createElement('li');
            li.className = 'history-item';

            var expr = document.createElement('span');
            expr.className = 'history-expr';
            // String concatenation to build display text is not arithmetic; the
            // expression and result come from the core, which already computed
            // them. entry.result is a finite number, so it renders cleanly.
            expr.textContent = entry.expression + ' = ' + entry.result;

            var time = document.createElement('span');
            time.className = 'history-time';
            var ts = (entry.timestamp instanceof Date) ? entry.timestamp : new Date(entry.timestamp);
            time.textContent = ts.toLocaleTimeString();

            li.appendChild(expr);
            li.appendChild(time);
            historyList.appendChild(li);
        }
    }

    /*
     * Compute handler (wired to #equals).
     *
     * Order of operations (agent prompt §5.2):
     *   1. Clear any prior #error message.
     *   2. Guard: if the calculator-core facade is missing / calculate is not a
     *      function, show a friendly message and stop.
     *   3. If no operator is selected, prompt for one and stop.
     *   4. Validate operand A (and operand B for binary operators). On the first
     *      invalid operand, show a targeted message and BLOCK - calculate() is
     *      never called with invalid input.
     *   5. Delegate to core.calculate(operator, ...operands) inside try/catch:
     *        success -> set #result, clear #error, re-render history (the core
     *                   already recorded the entry on success).
     *        failure -> show the structured error's message in #error and leave
     *                   #result unchanged (the core does not record failures, so
     *                   history stays correct).
     */
    function compute() {
        clearError();

        var core = getCore();
        if (!core || typeof core.calculate !== 'function') {
            showError('Calculator engine failed to load.');
            return;
        }

        if (!selectedOp) {
            showError('Please select an operator.');
            return;
        }

        var arity = arityFor(selectedOp);

        var a = readOperand(operandA);
        if (!a.ok) {
            showError('Please enter a valid number for the first operand.');
            return;
        }

        // Build the operand list: [a] for a unary operator, [a, b] for binary.
        var operands = [a.value];
        if (arity === 2) {
            var b = readOperand(operandB);
            if (!b.ok) {
                showError('Please enter a valid number for the second operand.');
                return;
            }
            operands.push(b.value);
        }

        try {
            // Delegate ALL arithmetic to the core (no math is performed here).
            // The core records a { expression, result, timestamp } entry on
            // success and throws a structured Error on failure.
            var r = core.calculate.apply(null, [selectedOp].concat(operands));
            if (resultEl) {
                resultEl.textContent = String(r);
            }
            clearError();
            renderHistory();
        } catch (err) {
            // Structured engine/facade errors (e.g. 'Divide by zero',
            // 'Square root of negative number') carry a human-readable message.
            // Surface it in the UI and leave #result untouched.
            showError(err && err.message ? err.message : 'Calculation error.');
        }
    }

    /*
     * Clear-history handler (wired to #clear-history): empty the core's history
     * store, then re-render the (now empty) panel.
     */
    function clearHistory() {
        var core = getCore();
        if (core && typeof core.clearHistory === 'function') {
            core.clearHistory();
        }
        renderHistory();
    }

    /*
     * One-time initialization: resolve DOM references, wire event listeners,
     * seed operator-button ARIA state, and render any pre-existing history
     * (normally empty at startup).
     */
    function init() {
        operandA = document.getElementById('operand-a');
        operandB = document.getElementById('operand-b');
        equalsBtn = document.getElementById('equals');
        resultEl = document.getElementById('result');
        errorEl = document.getElementById('error');
        historyList = document.getElementById('history-list');
        clearBtn = document.getElementById('clear-history');
        opButtons = document.querySelectorAll('.op-btn');

        // Operator buttons: on click, clear any stale error and select the
        // operator named by the button's data-op attribute. Each button starts
        // in the unselected ARIA state.
        if (opButtons) {
            for (var i = 0; i < opButtons.length; i++) {
                (function (btn) {
                    btn.setAttribute('aria-pressed', 'false');
                    btn.addEventListener('click', function () {
                        clearError();
                        selectOperator(btn.getAttribute('data-op'), btn);
                    });
                }(opButtons[i]));
            }
        }

        if (equalsBtn) {
            equalsBtn.addEventListener('click', compute);
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', clearHistory);
        }

        // Reflect any history that already exists (normally none) at startup.
        renderHistory();
    }

    // Bootstrap: run init() as soon as the DOM is ready. When this classic
    // script is placed at the end of <body> (after the core scripts) the DOM it
    // needs is already parsed; the DOMContentLoaded guard simply makes placement
    // in <head> safe too. By the time DOMContentLoaded fires, every
    // parser-inserted <script src> (including calculator.js) has executed, so
    // window.calculatorCore is available for the initial renderHistory().
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
