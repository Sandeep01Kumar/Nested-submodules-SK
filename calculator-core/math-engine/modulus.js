// One-function-per-file CommonJS op (AAP §0.1.2). Exported as a NAMED function
// EXPRESSION (not a top-level `function modulus` declaration) so the browser
// C-002 bridge — which loads these files as classic <script>s — does not also
// leak a stray `window.modulus` global (F-SEC-01 namespace pollution). A named
// expression keeps the name for stack traces yet creates NO global binding;
// window.mathEngine (populated by the bridge) remains the only exposure. In Node
// the behavior is identical (require() returns this function).
module.exports = function modulus(a,b){
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
        throw new Error('Invalid operand: not a finite number');
    }
    if (b === 0) {
        throw new Error('Modulus by zero');
    }
    return a%b;
};
