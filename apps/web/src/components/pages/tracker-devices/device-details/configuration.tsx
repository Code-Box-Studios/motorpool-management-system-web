import { useState } from 'react';
import { Copy, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { TRACKER_RCONF_MAX_LENGTH } from '@mms/shared';
import type { TrackerDevice } from '@/lib/api/tracker-devices';
import { useUpdateTrackerConfiguration } from '@/lib/mutation/tracker-devices';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  DetailGrid,
  DetailItem,
  DetailSection
} from '@/components/shared/detail-view';

const knownFlag = (value: boolean | null | undefined) =>
  value === true ? 'On' : value === false ? 'Off' : 'Unknown';
const interval = (value: number | null | undefined) =>
  value == null ? 'Unknown' : `${value} seconds`;

export function TrackerConfigurationCard({
  device
}: {
  device: TrackerDevice;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const save = useUpdateTrackerConfiguration();
  const configuration = device.configuration;

  const changeOpen = (next: boolean) => {
    // Keep a pending request visible so its outcome cannot land on a new import.
    if (save.isPending) return;
    setOpen(next);
    if (!next) {
      setReply('');
      save.reset();
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText('RCONF');
      toast.success('RCONF copied.');
    } catch {
      toast.error('Copy failed. Select and copy RCONF below.');
    }
  };

  return (
    <DetailSection
      title="Last confirmed configuration"
      description="Last saved tracker report. Settings are not read automatically and may have changed since this report."
      action={
        <Dialog open={open} onOpenChange={changeOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="size-4" />
              Update from RCONF
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Update from RCONF</DialogTitle>
              <DialogDescription>
                Save the settings reported by tracker {device.imei}.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <form
                id="tracker-configuration-form"
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!reply.trim() || save.isPending) return;
                  save.mutate(
                    { id: device.id, reply },
                    {
                      onSuccess: () => {
                        setOpen(false);
                        setReply('');
                        save.reset();
                      }
                    }
                  );
                }}
              >
                <div className="bg-muted/50 rounded-xl border p-4 text-sm">
                  <p>
                    Send{' '}
                    <code className="font-mono font-semibold select-all">
                      RCONF
                    </code>{' '}
                    to the tracker by SMS, then paste its full reply below.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={copyCommand}
                  >
                    <Copy className="size-4" />
                    Copy RCONF
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tracker-rconf-reply">RCONF reply</Label>
                  <Textarea
                    id="tracker-rconf-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={TRACKER_RCONF_MAX_LENGTH}
                    rows={7}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                    aria-describedby="tracker-rconf-help"
                    aria-invalid={!!save.error}
                    disabled={save.isPending}
                  />
                  <p
                    id="tracker-rconf-help"
                    className="text-muted-foreground text-xs"
                  >
                    Only recognized settings are saved. Passwords, control
                    numbers, SIM identifiers, and APN credentials are discarded.
                  </p>
                  {save.error && (
                    <p role="alert" className="text-destructive text-sm">
                      {save.error.message}
                    </p>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  Saving this report does not change hardware settings.
                </p>
              </form>
            </DialogBody>
            <DialogFooter>
              <Button
                type="submit"
                form="tracker-configuration-form"
                disabled={!reply.trim() || save.isPending}
              >
                {save.isPending ? 'Saving…' : 'Save configuration'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => changeOpen(false)}
                disabled={save.isPending}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {configuration ? (
        <div className="flex flex-col gap-5">
          <p className="text-muted-foreground text-sm">
            Saved from RCONF · Recorded{' '}
            <time dateTime={configuration.recordedAt}>
              {new Date(configuration.recordedAt).toLocaleString()}
            </time>
          </p>
          <DetailGrid>
            <DetailItem
              label="Model"
              value={configuration.model ?? 'Unknown'}
            />
            <DetailItem
              label="Firmware"
              value={configuration.firmware ?? 'Unknown'}
              mono
            />
            <DetailItem label="Mode" value={configuration.mode ?? 'Unknown'} />
            <DetailItem
              label="APN"
              value={configuration.apn ?? 'Unknown'}
              mono
            />
            <DetailItem
              label="Server"
              value={
                configuration.serverIp && configuration.serverPort != null
                  ? `${configuration.serverIp}:${configuration.serverPort}`
                  : 'Unknown'
              }
              mono
            />
            <DetailItem
              label="Time zone (reported)"
              value={configuration.timeZone ?? 'Unknown'}
              mono
            />
            <DetailItem
              label="Ignition on interval"
              value={interval(configuration.ignitionOnIntervalSeconds)}
            />
            <DetailItem
              label="Ignition off interval"
              value={interval(configuration.ignitionOffIntervalSeconds)}
            />
            <DetailItem label="Sleep" value={knownFlag(configuration.sleep)} />
            <DetailItem
              label="Power alarm"
              value={knownFlag(configuration.powerAlarm)}
            />
            <DetailItem
              label="Over speed alarm"
              value={knownFlag(configuration.overSpeedAlarm)}
            />
            <DetailItem
              label="Shake alarm"
              value={knownFlag(configuration.shakeAlarm)}
            />
            <DetailItem
              label="Geofence alarm"
              value={knownFlag(configuration.geofenceAlarm)}
            />
            <DetailItem
              label="ACC alarm SMS"
              value={knownFlag(configuration.accAlarmSms)}
            />
          </DetailGrid>
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">
          <p className="text-foreground font-medium">
            No configuration saved yet.
          </p>
          <p className="mt-1">
            Import a genuine RCONF reply to record this tracker's settings.
            Connection status and location reports do not confirm its
            configuration.
          </p>
        </div>
      )}
    </DetailSection>
  );
}
