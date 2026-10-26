import { z } from 'zod';
const dateRowSchema = z.object({
  date: z.string().min(1, 'Pick a departure date'),
  returnDate: z.string().min(1, 'Pick a return date'),
  start: z.string().min(1, 'Departure time'),
  end: z.string().min(1, 'Return time')
});

// A row's own instants, or null while it is still incomplete (required-field
// errors already cover that case, so overlap/ordering checks skip it).
function rowSpan(row: z.infer<typeof dateRowSchema>) {
  if (!row.date || !row.returnDate || !row.start || !row.end) return null;
  const start = new Date(`${row.date}T${row.start}+08:00`);
  const end = new Date(`${row.returnDate}T${row.end}+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export const datesFieldSchema = z
  .array(dateRowSchema)
  .min(1, 'A trip needs at least one date')
  .superRefine((rows, ctx) => {
    const spans = rows.map(rowSpan);

    spans.forEach((span, i) => {
      if (span && !(span.end.getTime() > span.start.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Return must be after departure',
          path: [i, 'end']
        });
      }
    });

    // Mirrors the server's half-open semantics: [aStart, aEnd) intersects
    // [bStart, bEnd) iff aStart < bEnd && aEnd > bStart. Two dates that merely
    // touch — one ends exactly when the next begins — are NOT an overlap.
    for (let i = 0; i < spans.length; i++) {
      const a = spans[i];
      if (!a) continue;
      for (let j = i + 1; j < spans.length; j++) {
        const b = spans[j];
        if (!b) continue;
        if (
          a.start.getTime() < b.end.getTime() &&
          a.end.getTime() > b.start.getTime()
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'This date overlaps another one above',
            path: [j, 'date']
          });
        }
      }
    }
  });

export const outingPayload = (row: z.infer<typeof dateRowSchema>) => ({
  startTs: new Date(`${row.date}T${row.start}+08:00`).toISOString(),
  endTs: new Date(`${row.returnDate}T${row.end}+08:00`).toISOString()
});
