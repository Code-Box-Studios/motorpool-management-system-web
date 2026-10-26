export const dateLabel = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      }).format(date)
    : null;
export const timeLabel = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date)
    : null;
export const timestampLabel = (date: Date | null | undefined) =>
  date ? `${dateLabel(date)} ${timeLabel(date)}` : null;
export const reference = (prefix: string, number: number) =>
  `${prefix}-${String(number).padStart(4, '0')}`;
export const titleCase = (value: string | null | undefined) =>
  value
    ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
