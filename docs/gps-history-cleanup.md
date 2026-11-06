# Remove Legacy Simulated GPS History

The application no longer generates GPS positions or seeds GPS history. The gateway and API remain the source of live tracker readings.

The cleanup script recognizes the old 50-point seed pattern, the removed browser route, and the standalone TCP simulator's route and fixed telemetry. It requires an explicit UTC cutoff and preserves every point at or after that cutoff. Older nonmatching or trip-linked rows are preserved for review, not assumed to be simulated.

For this deployment, the decoder supporting the first real ST-901L-X frames started at **2026-11-06 05:36:19 UTC**. First inspect the intended database:

```bash
pnpm --filter @mms/api exec node scripts/cleanup-simulated-gps.mjs \
  --before 2026-11-06T05:36:19Z
```

The default is a dry run. It prints the database host/name and candidate counts without credentials or location data. Check `unmatchedOlderPoints` separately; the script does not classify arbitrary manual test data.

To apply an inspected cleanup, choose a new backup path on a private filesystem:

```bash
pnpm --filter @mms/api exec node scripts/cleanup-simulated-gps.mjs \
  --before 2026-11-06T05:36:19Z \
  --apply --backup /tmp/mms-gps-before-cleanup.json
```

The script writes and flushes a JSON backup with permissions `0600` before deletion. Existing backup files are never overwritten. It deletes only the selected row IDs in a transaction and rebuilds affected vehicles' cached positions from remaining GPS history. Rows and vehicle locations are locked in a stable order so live ingestion can resume normally after the transaction.

Keep the backup until the cleanup is verified. It contains the selected GPS rows and the affected vehicles' previous cached location fields for recovery. Do not commit it to Git.
