function add(a,b){
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
        throw new Error('Invalid operand: not a finite number');
    }
    // Guard the RESULT domain: two finite operands can still overflow to a
    // non-finite value (e.g. add(Number.MAX_VALUE, Number.MAX_VALUE) === Infinity).
    // Surface it as an explicit, facade-compatible error rather than silently
    // returning Infinity/-Infinity/NaN (never return an invalid result).
    const result = a+b;
    if (!Number.isFinite(result)) {
        throw new Error('Result is not a finite number');
    }
    return result;
}

module.exports = add;
