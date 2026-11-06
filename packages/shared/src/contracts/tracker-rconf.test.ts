import { describe, expect, it } from 'vitest';
import { parseTrackerRconfReply } from './tracker-devices.js';

const header = 'ST-901L-X:V5.25,ID:1234567890';

describe('ST-901 RCONF parser', () => {
  it('parses comma-delimited settings without retaining passwords, control numbers or APN credentials', () => {
    const result = parseTrackerRconfReply(`${header},UP:private-password,U1:private-phone,U2:,U3:,MODE:GPRS,POWER ALARM:OFF,OVER SPEED:OFF,SHAKE ALARM:OFF,GEO FENCE: OFF,SLEEP:OFF,ACC ALARM SMS: OFF,APN:internet,private-user,private-apn-password,IP:198.51.100.42,5013,GPRS UPLOAD TIME:5,5,TIME ZONE:E00,ICCID:private-iccid`);
    expect(result).toEqual({ deviceId: '1234567890', model: 'ST-901L-X', firmware: 'V5.25', mode: 'GPRS', apn: 'internet', serverIp: '198.51.100.42', serverPort: 5013, ignitionOnIntervalSeconds: 5, ignitionOffIntervalSeconds: 5, timeZone: 'E00', sleep: false, powerAlarm: false, overSpeedAlarm: false, shakeAlarm: false, geofenceAlarm: false, accAlarmSms: false });
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('supports whitespace/newlines, zero intervals and different on/off values', () => {
    const result = parseTrackerRconfReply(' ST-901L-X: V5.25\nID:1234567890\n MODE:SMS\nSLEEP:ON\nGPRS UPLOAD TIME:0,30\nTIME ZONE:W08 ');
    expect(result).toMatchObject({ mode: 'SMS', sleep: true, ignitionOnIntervalSeconds: 0, ignitionOffIntervalSeconds: 30, timeZone: 'W08' });
  });

  it('keeps absent and unrecognized settings unknown', () => {
    const result = parseTrackerRconfReply(`${header},MODE:UNRECOGNIZED,SLEEP:UNKNOWN,EXTRA:ignored`);
    expect(result).toMatchObject({ mode: null, apn: null, serverIp: null, serverPort: null, ignitionOnIntervalSeconds: null, ignitionOffIntervalSeconds: null, timeZone: null, sleep: null, powerAlarm: null });
  });

  it('ignores arbitrary values in credential and unsupported fields', () => {
    const result = parseTrackerRconfReply(`${header},UP:secret:https://private.invalid,U1:private,MODE:GPRS,APN:internet,secret-user,secret-password,SIM:private,ICCID:private`);
    expect(result.apn).toBe('internet');
    expect(JSON.stringify(result)).not.toMatch(/secret|private/);
  });

  it.each(['', 'SET OK', 'ID:1234567890,MODE:GPRS', 'ST-901L-X:V5.25,MODE:GPRS', `${header},ID:9999999999,MODE:GPRS`, `${header},IP:999.0.0.1,5013`, `${header},IP:198.51.100.42,70000`, `${header},GPRS UPLOAD TIME:broken,5`, `${header},GPRS UPLOAD TIME:5`, `${header},GPRS UPLOAD TIME:5,5,secret`, 'x'.repeat(4097)])('rejects malformed report %#', (reply) => {
    expect(() => parseTrackerRconfReply(reply)).toThrow('Invalid ST-901 RCONF reply');
  });
});
