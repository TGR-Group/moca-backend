export const zeroPadding = (number: number, digit = 0) => {
    const fillNumber = digit - String(number).length;

    return fillNumber > 0 ? '0'.repeat(fillNumber) + number : number;
};