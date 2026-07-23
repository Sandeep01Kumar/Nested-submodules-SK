// One-function-per-file CommonJS op (AAP §0.1.2). Exported as a NAMED function
// EXPRESSION (not a top-level `function divide` declaration) so the browser
// C-002 bridge — which loads these files as classic <script>s — does not also
// leak a stray `window.divide` global (F-SEC-01 namespace pollution). A named
// expression keeps the name for stack traces yet creates NO global binding;
// window.mathEngine (populated by the bridge) remains the only exposure. In Node
// the behavior is identical (require() returns this function).
module.exports = function divide(a,b){
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
        throw new Error('Invalid operand: not a finite number');
    }
    if (b === 0) {
        throw new Error('Divide by zero');
    }
    // Guard the RESULT domain: even finite, non-zero operands can overflow to a
    // non-finite value (e.g. divide(Number.MAX_VALUE, Number.MIN_VALUE) === Infinity).
    // Surface it as an explicit, facade-compatible error rather than silently
    // returning Infinity/-Infinity/NaN (never return an invalid result; C-004).
    const result = a/b;
    if (!Number.isFinite(result)) {
        throw new Error('Result is not a finite number');
    }
    return result;
};
