import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import {
  TRACKER_PACKET_KINDS,
  TRACKER_PACKET_OUTCOMES,
  type TrackerPacketLog,
  type TrackerPacketQuery
} from '@mms/shared';
import PageHeader from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useTrackerPackets } from '@/lib/query/tracker-packets';
import { cn } from '@/lib/utils';

const OUTCOME_LABELS: Record<TrackerPacketLog['outcome'], string> = {
  received: 'Received / pending',
  saved: 'Position saved',
  heartbeat: 'Heartbeat',
  invalid_fix: 'Invalid fix',
  device_unavailable: 'Device unavailable',
  unsupported: 'Unsupported / malformed',
  incomplete: 'Incomplete',
  oversized: 'Oversized',
  resolution_error: 'Resolution error',
  forward_error: 'Forwarding error',
  socket_error: 'Socket error'
};
const KIND_LABELS: Record<TrackerPacketLog['kind'], string> = {
  position: 'Position',
  heartbeat: 'Heartbeat',
  unknown: 'Unknown',
  fragment: 'Fragment',
  socket_error: 'Socket error'
};
const ALL = '__all__';
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'shortOffset'
});
function time(value: string | number | null) {
  if (value === null) return 'Not reported';
  return dateFormatter.format(new Date(value));
}
function outcomeVariant(outcome: TrackerPacketLog['outcome']) {
  if (outcome === 'saved') return 'done';
  if (outcome === 'heartbeat') return 'move';
  if (outcome === 'received') return 'wait';
  if (outcome === 'incomplete' || outcome === 'unsupported') return 'neutral';
  return 'stop';
}
function coordinates(packet: TrackerPacketLog) {
  if (packet.latitude === null && packet.longitude === null) return null;
  return `${packet.latitude?.toFixed(6) ?? 'Unknown latitude'}, ${packet.longitude?.toFixed(6) ?? 'Unknown longitude'}`;
}
function invalidCoordinates(packet: TrackerPacketLog) {
  return (
    packet.outcome === 'invalid_fix' ||
    (packet.latitude !== null && Math.abs(packet.latitude) > 90) ||
    (packet.longitude !== null && Math.abs(packet.longitude) > 180)
  );
}
// Escaping each byte keeps control and non-UTF-8 bytes reversible. React renders
// printable bytes as text too; payloads never become markup.
function escapedBytes(hex: string) {
  return (hex.match(/../g) ?? [])
    .map((pair) => {
      const byte = parseInt(pair, 16);
      if (byte === 92) return '\\\\';
      if (byte === 13) return '\\r';
      if (byte === 10) return '\\n';
      if (byte === 9) return '\\t';
      return byte >= 32 && byte <= 126
        ? String.fromCharCode(byte)
        : `\\x${pair.toLowerCase()}`;
    })
    .join('');
}
function Metadata({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-sm [overflow-wrap:anywhere] break-words">
        {children}
      </dd>
    </div>
  );
}
function PacketDetails({ packet }: { packet: TrackerPacketLog }) {
  const [hex, setHex] = useState(false);
  const coordinateText = coordinates(packet);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setHex(false);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Inspect ${packet.deviceId ?? 'unknown fragment'} at ${time(packet.receivedAt)}`}
        >
          Inspect
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Packet details</DialogTitle>
          <DialogDescription>
            Original receipt and processing outcome. Times shown in {TIME_ZONE}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          <div className="space-y-2">
            <Badge variant={outcomeVariant(packet.outcome)}>
              {OUTCOME_LABELS[packet.outcome]}
            </Badge>
            <p className="text-sm [overflow-wrap:anywhere] break-words">
              {packet.reason ??
                (packet.outcome === 'received'
                  ? 'Processing outcome has not arrived yet.'
                  : 'No additional processing details.')}
            </p>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Metadata label="Tracker ID">
              <span className="font-mono">
                {packet.deviceId ?? 'Unknown — no tracker ID decoded'}
              </span>
            </Metadata>
            <Metadata label="Message">
              {packet.messageType ?? 'Unknown'} · {KIND_LABELS[packet.kind]}
            </Metadata>
            <Metadata label="Received">{time(packet.receivedAt)}</Metadata>
            <Metadata label="Tracker fix time">{time(packet.fixTime)}</Metadata>
            <Metadata label="Stored">{time(packet.storedAt)}</Metadata>
            <Metadata label="Vehicle at processing">
              <span className="font-mono">
                {packet.vehicleId ?? 'No resolved vehicle'}
              </span>
            </Metadata>
            <Metadata label="Reported coordinates">
              <span className="font-mono">
                {coordinateText ?? 'Not reported'}
              </span>
              {invalidCoordinates(packet) && (
                <span className="text-destructive mt-1 block font-medium">
                  Invalid fix · not used for location
                </span>
              )}
            </Metadata>
            <Metadata label="Reported telemetry">
              Speed:{' '}
              {packet.speed === null ? 'Unknown' : `${packet.speed} km/h`} ·
              Heading:{' '}
              {packet.heading === null ? 'Unknown' : `${packet.heading}°`} ·
              Ignition:{' '}
              {packet.ignition === null
                ? 'Unknown'
                : packet.ignition
                  ? 'On'
                  : 'Off'}
            </Metadata>
            <Metadata label="Remote peer">
              <span className="font-mono">{packet.peer}</span>
            </Metadata>
            <Metadata label="Connection ID">
              <span className="font-mono">{packet.connectionId}</span>
            </Metadata>
            <Metadata label="Receipt ID">
              <span className="font-mono">{packet.id}</span>
            </Metadata>
          </dl>
          <section aria-label="Raw payload" className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={hex ? 'outline' : 'default'}
                aria-pressed={!hex}
                onClick={() => setHex(false)}
              >
                Raw text
              </Button>
              <Button
                size="sm"
                variant={hex ? 'default' : 'outline'}
                aria-pressed={hex}
                onClick={() => setHex(true)}
              >
                Hex bytes
              </Button>
              <span className="text-muted-foreground text-xs">
                {packet.rawHex.length / 2} bytes
              </span>
            </div>
            <pre
              tabIndex={0}
              aria-label={hex ? 'Hex payload' : 'Escaped raw text'}
              className="bg-muted max-h-64 max-w-full overflow-auto rounded-lg border p-4 font-mono text-xs [overflow-wrap:anywhere] break-all whitespace-pre-wrap"
            >
              {hex
                ? (packet.rawHex.match(/../g) ?? []).join(' ')
                : escapedBytes(packet.rawHex)}
            </pre>
            <p className="text-muted-foreground text-xs">
              Raw text escapes control and non-ASCII bytes as \xNN. Hex bytes
              preserve the exact payload.
            </p>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

interface Filters {
  search: string;
  outcome: TrackerPacketQuery['outcome'] | '';
  kind: TrackerPacketQuery['kind'] | '';
  from: string;
  to: string;
  cursors: (string | undefined)[];
}
const initialFilters: Filters = {
  search: '',
  outcome: '',
  kind: '',
  from: '',
  to: '',
  cursors: [undefined]
};
function isoLocal(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export default function TrackerLogs({ deviceId }: { deviceId?: string }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const navigate = useNavigate();
  const { search, outcome, kind, from, to, cursors } = filters;
  const cursor = cursors.at(-1);
  const fromIso = isoLocal(from);
  const toIso = isoLocal(to);
  const invalidRange = !!fromIso && !!toIso && fromIso > toIso;
  const query = useTrackerPackets(
    {
      deviceId,
      search: search.trim() || undefined,
      outcome: outcome || undefined,
      kind: kind || undefined,
      from: fromIso,
      to: toIso,
      cursor,
      limit: 25
    },
    autoRefresh,
    !invalidRange
  );
  const rows = query.data?.data;
  const hasFilters = !!(deviceId || search || outcome || kind || from || to);
  function updateFilter<K extends Exclude<keyof Filters, 'cursors'>>(
    key: K,
    value: Filters[K]
  ) {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      cursors: [undefined]
    }));
  }
  function reset() {
    setFilters(initialFilters);
    if (deviceId) void navigate({ to: '/tracker-logs', search: {} });
  }
  return (
    <div className="min-w-0">
      <PageHeader
        title="Tracker Logs"
        description="See what arrived, what the tracker reported, and what happened next."
        action={
          <Link
            to="/tracker-devices"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Tracker Devices
          </Link>
        }
      />
      <p className="text-muted-foreground mb-6 rounded-lg border px-4 py-3 text-sm">
        Capture starts after the updated gateway is deployed. Historical
        rejected packets cannot be recovered from GPS history.
      </p>
      <Card className="min-w-0">
        <CardContent className="min-w-0 space-y-5">
          <div className="grid min-w-0 grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="packet-search">Search tracker ID</Label>
              <Input
                id="packet-search"
                type="search"
                value={deviceId ?? search}
                disabled={!!deviceId}
                placeholder="Search transmitted tracker ID"
                onChange={(event) => updateFilter('search', event.target.value)}
              />
              {deviceId && (
                <p className="text-muted-foreground text-xs">
                  Exact ID filter.{' '}
                  <Link
                    to="/tracker-logs"
                    search={{}}
                    className="text-foreground underline"
                  >
                    Search all trackers
                  </Link>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="packet-outcome">Outcome</Label>
              <Select
                value={outcome || ALL}
                onValueChange={(value) =>
                  updateFilter(
                    'outcome',
                    value === ALL ? '' : (value as TrackerPacketLog['outcome'])
                  )
                }
              >
                <SelectTrigger id="packet-outcome" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All outcomes</SelectItem>
                  {TRACKER_PACKET_OUTCOMES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {OUTCOME_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="packet-kind">Message kind</Label>
              <Select
                value={kind || ALL}
                onValueChange={(value) =>
                  updateFilter(
                    'kind',
                    value === ALL ? '' : (value as TrackerPacketLog['kind'])
                  )
                }
              >
                <SelectTrigger id="packet-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All messages</SelectItem>
                  {TRACKER_PACKET_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {KIND_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="packet-from">Received from ({TIME_ZONE})</Label>
              <Input
                id="packet-from"
                type="datetime-local"
                value={from}
                max={to || undefined}
                onChange={(event) => updateFilter('from', event.target.value)}
                className="min-w-0"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="packet-to">Received to ({TIME_ZONE})</Label>
              <Input
                id="packet-to"
                type="datetime-local"
                value={to}
                min={from || undefined}
                onChange={(event) => updateFilter('to', event.target.value)}
                className="min-w-0"
              />
            </div>
            <Button variant="outline" onClick={reset} disabled={!hasFilters}>
              Reset filters
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="outline"
                onClick={() => void query.refetch()}
                disabled={query.isFetching || invalidRange}
              >
                <RefreshCw
                  className={cn('size-4', query.isFetching && 'animate-spin')}
                />
                Refresh
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                  className="accent-primary size-4"
                />
                Auto-refresh every 5 seconds
              </label>
            </div>
            <div className="text-muted-foreground text-xs" role="status">
              {query.dataUpdatedAt
                ? `Last successful refresh: ${time(query.dataUpdatedAt)}`
                : 'No successful refresh yet'}
              {autoRefresh && cursor && (
                <span className="mt-1 block">
                  Automatic refresh paused on older pages.
                </span>
              )}
            </div>
          </div>
          {invalidRange && (
            <p role="alert" className="text-destructive text-sm">
              Received from must be before received to.
            </p>
          )}
          {query.error && (
            <div
              role="alert"
              className="border-destructive/30 text-destructive rounded-lg border p-4 text-sm"
            >
              <p className="font-semibold">
                {rows
                  ? 'Could not refresh tracker logs'
                  : 'Could not load tracker logs'}
              </p>
              <p>{query.error.message}</p>
              {rows && (
                <p>Showing cached receipts from the last successful refresh.</p>
              )}
            </div>
          )}
          {query.isPending && !invalidRange ? (
            <p
              role="status"
              className="text-muted-foreground py-12 text-center text-sm"
            >
              Loading tracker logs…
            </p>
          ) : rows && !invalidRange ? (
            rows.length ? (
              <Table className="min-w-[860px]">
                <caption className="sr-only">
                  Tracker packet receipts, newest first. Times in {TIME_ZONE}.
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received · {TIME_ZONE}</TableHead>
                    <TableHead>Tracker ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>Packet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((packet) => (
                    <TableRow key={packet.id}>
                      <TableCell className="text-xs">
                        <time
                          dateTime={packet.receivedAt}
                          title={packet.receivedAt}
                        >
                          {time(packet.receivedAt)}
                        </time>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {packet.deviceId ?? (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                        {!packet.deviceId && (
                          <span className="text-muted-foreground mt-1 block font-sans">
                            No tracker ID decoded
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {packet.messageType ?? KIND_LABELS[packet.kind]}
                        {packet.messageType && (
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {KIND_LABELS[packet.kind]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={outcomeVariant(packet.outcome)}>
                          {OUTCOME_LABELS[packet.outcome]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {coordinates(packet) ?? 'Not reported'}
                        {invalidCoordinates(packet) && (
                          <span className="text-destructive mt-1 block font-sans">
                            Invalid fix · not used for location
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <PacketDetails packet={packet} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">
                <p className="font-semibold">
                  {hasFilters
                    ? 'No matching packets'
                    : 'No packets received yet'}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {hasFilters
                    ? 'Try another tracker ID, outcome, message kind, or receipt time.'
                    : 'New receipts appear when tracker traffic reaches the updated gateway.'}
                </p>
              </div>
            )
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <p className="text-muted-foreground">
              {query.data
                ? `${query.data.count.toLocaleString()} matching receipts · Newest first`
                : 'Newest first'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground mr-2">
                Page {cursors.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={cursors.length === 1 || query.isFetching}
                onClick={() =>
                  setFilters((previous) => ({
                    ...previous,
                    cursors: [undefined]
                  }))
                }
              >
                Newest
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={cursors.length === 1 || query.isFetching}
                onClick={() =>
                  setFilters((previous) => ({
                    ...previous,
                    cursors: previous.cursors.slice(0, -1)
                  }))
                }
              >
                Newer
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !query.data?.nextCursor || query.isFetching || invalidRange
                }
                onClick={() =>
                  setFilters((previous) => ({
                    ...previous,
                    cursors: [...previous.cursors, query.data!.nextCursor!]
                  }))
                }
              >
                Older
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
