function divide(a,b){
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
}

module.exports = divide;
