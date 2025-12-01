export const formatShares = (value: number): string => {
  const floored = Math.floor(Number(value) || 0);
  return floored.toLocaleString();
};

export const formatCompactNumber = (value: number): string => {
  const n = Math.floor(Number(value) || 0);
  const abs = Math.abs(n);

  const formatWithUnit = (divisor: number, suffix: string) => {
    const scaledRaw = abs / divisor;
    const scaled = Math.floor(scaledRaw * 100) / 100;
    const hasDecimal = scaled % 1 !== 0;
    const scaledStr = hasDecimal
      ? scaled.toFixed(2).replace(/\.?0+$/, '')
      : scaled.toString();
    const sign = n < 0 ? '-' : '';
    return `${sign}${scaledStr}${suffix}`;
  };

  if (abs >= 1_000_000_000) {
    return formatWithUnit(1_000_000_000, 'B');
  }
  if (abs >= 1_000_000) {
    return formatWithUnit(1_000_000, 'M');
  }
  if (abs >= 1_000) {
    return formatWithUnit(1_000, 'K');
  }

  return n.toLocaleString();
};



