export const displayCell = (value: string | number | null | undefined) =>
  value === null || value === undefined
    ? 'Not recorded'
    : typeof value === 'number'
      ? value.toLocaleString('en-PH', { maximumFractionDigits: 4 })
      : value;
