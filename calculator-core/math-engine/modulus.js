function modulus(a,b){
    if (typeof a !== 'number' || !Number.isFinite(a) || typeof b !== 'number' || !Number.isFinite(b)) {
        throw new Error('Invalid operand: not a finite number');
    }
    if (b === 0) {
        throw new Error('Modulus by zero');
    }
    return a%b;
}

module.exports = modulus;
