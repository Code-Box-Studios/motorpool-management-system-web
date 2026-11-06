import { z } from 'zod';

export const TRACKER_RCONF_MAX_LENGTH = 4096;

export const updateTrackerConfigurationBodySchema = z.object({
  reply: z.string().trim().min(1).max(TRACKER_RCONF_MAX_LENGTH)
}).strict();
export type UpdateTrackerConfigurationBody = z.infer<typeof updateTrackerConfigurationBodySchema>;

/** Only non-secret settings from an administrator-supplied ST-901 RCONF reply. */
export interface TrackerRconfSettings {
  deviceId: string;
  model: string;
  firmware: string;
  mode: 'GPRS' | 'SMS' | null;
  apn: string | null;
  serverIp: string | null;
  serverPort: number | null;
  ignitionOnIntervalSeconds: number | null;
  ignitionOffIntervalSeconds: number | null;
  timeZone: string | null;
  sleep: boolean | null;
  powerAlarm: boolean | null;
  overSpeedAlarm: boolean | null;
  shakeAlarm: boolean | null;
  geofenceAlarm: boolean | null;
  accAlarmSms: boolean | null;
}

export interface TrackerConfiguration extends TrackerRconfSettings {
  source: 'rconf';
  /** Server receipt time, not a claim about when the device generated its reply. */
  recordedAt: string;
}

function invalidReply(): never {
  // Never put the reply or a field value into errors: it can contain secrets.
  throw new Error('Invalid ST-901 RCONF reply');
}

/** Parse an allowlist. Raw replies, passwords, control numbers and APN credentials never leave this function. */
export function parseTrackerRconfReply(reply: string): TrackerRconfSettings {
  if (!reply.trim() || reply.length > TRACKER_RCONF_MAX_LENGTH) invalidReply();
  const tokens = reply.trim().split(/[,\r\n]+/).map((token) => token.trim());
  const header = /^(ST-901[A-Z0-9-]*)\s*:\s*(V[A-Z0-9._-]{1,30})$/i.exec(tokens[0]);
  if (!header) invalidReply();

  const fields = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const token of tokens.slice(1)) {
    const field = /^([A-Z][A-Z0-9 -]*)\s*:\s*(.*)$/i.exec(token);
    if (field) {
      const key = field[1].trim().replace(/\s+/g, ' ').toUpperCase();
      if (fields.has(key)) invalidReply();
      current = [field[2].trim()];
      fields.set(key, current);
    } else if (token) {
      current?.push(token);
    }
  }
  const single = (key: string): string | undefined => {
    const values = fields.get(key);
    if (values && values.length !== 1) invalidReply();
    return values?.[0];
  };
  const deviceId = single('ID');
  if (!deviceId || !/^\d{5,20}$/.test(deviceId)) invalidReply();
  const settingsKeys = ['MODE', 'APN', 'IP', 'GPRS UPLOAD TIME', 'TIME ZONE', 'SLEEP', 'POWER ALARM', 'OVER SPEED', 'SHAKE ALARM', 'GEO FENCE', 'ACC ALARM SMS'];
  if (!settingsKeys.some((key) => fields.has(key))) invalidReply();

  const flag = (key: string): boolean | null => {
    const value = single(key)?.toUpperCase();
    return value === 'ON' ? true : value === 'OFF' ? false : null;
  };
  const mode = single('MODE')?.toUpperCase();
  // APN may be followed by a username and password. Keep only the APN name.
  const apn = fields.get('APN')?.[0];
  const timeZone = single('TIME ZONE')?.toUpperCase();
  let serverIp: string | null = null;
  let serverPort: number | null = null;
  const ip = fields.get('IP');
  if (ip) {
    if (ip.length !== 2 || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip[0]) || ip[0].split('.').some((part) => Number(part) > 255) || !/^\d{1,5}$/.test(ip[1]) || Number(ip[1]) < 1 || Number(ip[1]) > 65535) invalidReply();
    [serverIp, serverPort] = [ip[0], Number(ip[1])];
  }
  let ignitionOnIntervalSeconds: number | null = null;
  let ignitionOffIntervalSeconds: number | null = null;
  const intervals = fields.get('GPRS UPLOAD TIME');
  if (intervals) {
    if (intervals.length !== 2 || intervals.some((value) => !/^\d{1,10}$/.test(value) || Number(value) > 2147483647)) invalidReply();
    [ignitionOnIntervalSeconds, ignitionOffIntervalSeconds] = intervals.map(Number);
  }
  return {
    deviceId, model: header[1].toUpperCase(), firmware: header[2],
    mode: mode === 'GPRS' || mode === 'SMS' ? mode : null,
    apn: apn && /^[A-Z0-9][A-Z0-9._-]{0,99}$/i.test(apn) ? apn : null,
    serverIp, serverPort, ignitionOnIntervalSeconds, ignitionOffIntervalSeconds,
    timeZone: timeZone && /^[EW]\d{1,2}(?:[.:]\d{2})?$/.test(timeZone) ? timeZone : null,
    sleep: flag('SLEEP'), powerAlarm: flag('POWER ALARM'),
    overSpeedAlarm: flag('OVER SPEED'), shakeAlarm: flag('SHAKE ALARM'),
    geofenceAlarm: flag('GEO FENCE'), accAlarmSms: flag('ACC ALARM SMS')
  };
}
