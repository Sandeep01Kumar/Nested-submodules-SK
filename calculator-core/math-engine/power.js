function power(a,b){
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
}

module.exports = power;
