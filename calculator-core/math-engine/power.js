function power(a,b){
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
        throw new Error('Invalid operand: not a finite number');
    }
    return Math.pow(a, b);
}

module.exports = power;
