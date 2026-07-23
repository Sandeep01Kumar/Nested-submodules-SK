// One-function-per-file CommonJS op (AAP §0.1.2). Exported as a NAMED function
// EXPRESSION (not a top-level `function sqrt` declaration) so the browser
// C-002 bridge — which loads these files as classic <script>s — does not also
// leak a stray `window.sqrt` global (F-SEC-01 namespace pollution). A named
// expression keeps the name for stack traces yet creates NO global binding;
// window.mathEngine (populated by the bridge) remains the only exposure. In Node
// the behavior is identical (require() returns this function).
module.exports = function sqrt(a){
    if (typeof a !== 'number' || !Number.isFinite(a)) {
        throw new Error('Invalid operand: not a finite number');
    }
    if (a < 0) {
        throw new Error('Square root of negative number');
    }
    return Math.sqrt(a);
};
