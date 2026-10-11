/** GTIN (EAN-8, UPC-A/12, EAN-13, GTIN-14) and UPC-E check-digit validation. Digits only. */

function checksumOk(code: string): boolean {
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // Weights 3,1,3,1... counted from the digit next to the check digit.
    const fromRight = digits.length - 1 - i;
    sum += digits[i] * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-E (8 digits, number system 0/1) expanded to its 12-digit UPC-A form. */
export function upcEToUpcA(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const ns = upce[0];
  const d = upce.slice(1, 7);
  const chk = upce[7];
  const last = d[5];
  let body: string;
  if (last === '0' || last === '1' || last === '2') body = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + last;
  return ns + body + chk;
}

export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  if (code.length === 8 && !checksumOk(code)) {
    const a = upcEToUpcA(code);
    return a !== null && checksumOk(a);
  }
  return checksumOk(code);
}

/** Equivalent codes a product may be stored under (UPC-A <-> EAN-13 zero padding, UPC-E expansion). */
export function barcodeCandidates(code: string): string[] {
  const out = new Set<string>([code]);
  if (code.length === 8) {
    const a = upcEToUpcA(code);
    if (a) {
      out.add(a);
      out.add('0' + a);
    }
  }
  if (code.length === 12) out.add('0' + code);
  if (code.length === 13 && code.startsWith('0')) out.add(code.slice(1));
  return [...out];
}
