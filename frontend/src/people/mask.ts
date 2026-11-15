export function maskIdCard(value: string) {
    const text = value.trim();
    return text.length === 18 ? `${text.slice(0, 6)}********${text.slice(-4)}` : '********';
}

export function maskBankCard(value: string) {
    const digits = value.replace(/\s/g, '');
    return digits.length > 4 ? `**** ${digits.slice(-4)}` : '****';
}