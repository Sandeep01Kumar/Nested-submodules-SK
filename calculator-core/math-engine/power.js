// One-function-per-file CommonJS op (AAP §0.1.2). Exported as a NAMED function
// EXPRESSION (not a top-level `function power` declaration) so the browser
// C-002 bridge — which loads these files as classic <script>s — does not also
// leak a stray `window.power` global (F-SEC-01 namespace pollution). A named
// expression keeps the name for stack traces yet creates NO global binding;
// window.mathEngine (populated by the bridge) remains the only exposure. In Node
// the behavior is identical (require() returns this function).
module.exports = function power(a,b){
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
        throw new Error('Invalid operand: not a finite number');
    }
    // Guard the RESULT domain: finite operands can still produce a non-finite
    // value (e.g. power(-2, 0.5) === NaN, power(0, -1) === Infinity, and large
    // exponents overflow to Infinity). Surface it as an explicit,
    // facade-compatible error rather than silently returning NaN/Infinity.
    const result = Math.pow(a, b);
    if (!Number.isFinite(result)) {
        throw new Error('Result is not a finite number');
    }
    return result;
};
