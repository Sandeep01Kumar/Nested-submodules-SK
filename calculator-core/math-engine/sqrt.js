function sqrt(a){
    if (typeof a !== 'number' || !Number.isFinite(a)) {
        throw new Error('Invalid operand: not a finite number');
    }
    if (a < 0) {
        throw new Error('Square root of negative number');
    }
    return Math.sqrt(a);
}

module.exports = sqrt;
