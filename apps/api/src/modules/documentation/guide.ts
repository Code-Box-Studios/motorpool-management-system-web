import type { DocumentationGuide } from '@mms/shared';

const cloud = '  --project=um-mms-gps \\\n  --zone=us-central1-a';
const ssh = `gcloud compute ssh mms-gps-gateway \\\n${cloud} \\\n`;
const repository =
  'https://github.com/Code-Box-Studios/motorpool-management-system-web/blob/main/docs/';

// Keep the actual guide on the server. Only its types belong in the web bundle.
export const gpsGuide: DocumentationGuide = {
  id: 'gps',
  title: 'GPS setup and everyday use',
  description:
    'A practical guide to connecting a SinoTrack ST-901L-X to a vehicle and checking it in MMS.',
  verifiedOn: '6 November 2026',
  sections: [
    {
      id: 'start',
      title: 'Start here',
      summary:
        'What the tracker does, who helps with setup, and what needs to stay on.',
      blocks: [
        {
          kind: 'callout',
          tone: 'success',
          title: 'Yes, you can close the browser.',
          text: 'After setup, you can close MMS, close Cloud Shell, or turn off your setup computer. Tracking continues through the tracker’s SIM and a background service on the cloud server.'
        },
        {
          kind: 'text',
          text: 'This guide is for another SinoTrack ST-901L-X 4G tracker. Reuse the existing MMS GPS server. Each tracker needs its own SIM, device record, and vehicle assignment.'
        },
        {
          kind: 'table',
          headings: ['What you want to do', 'Chapter to open'],
          rows: [
            [
              'Prepare a tracker and send its setup messages',
              'Install a new tracker'
            ],
            [
              'Connect the tracker to the correct car in MMS',
              'Register it in MMS'
            ],
            [
              'Make sure the location is real and current',
              'Check that it works'
            ],
            ['Understand an error or an offline tracker', 'Fix a problem'],
            ['Check or restart the cloud server', 'For technical support']
          ]
        },
        {
          kind: 'checklist',
          items: [
            'Keep the tracker connected to suitable vehicle power.',
            'Keep the tracker’s SIM active, with mobile data available.',
            'Keep the Google Cloud server running and its billing active.',
            'Keep the MMS backend and database available. Your technical support person manages these services.'
          ]
        },
        {
          kind: 'text',
          text: 'You can handle the app and text messages. Use an automotive electrician for vehicle wiring. Ask technical support to check the cloud server and confirm the tracker’s reported device ID.'
        },
        { kind: 'link', label: 'Open GPS Map', href: '/gps-map' }
      ]
    },
    {
      id: 'install',
      title: 'Install a new tracker',
      summary:
        'Prepare the SIM, arrange safe wiring, and send the tracker its connection settings.',
      blocks: [
        {
          kind: 'checklist',
          items: [
            'A SinoTrack ST-901L-X and the wiring diagram supplied with that unit.',
            'An active SIM that can send and receive SMS and use mobile data.',
            'The SIM’s phone number and its provider’s APN. An APN is the mobile-data connection setting.',
            'A phone for sending the setup messages.',
            'An MMS Admin account and help from an automotive electrician.'
          ]
        },
        {
          kind: 'steps',
          items: [
            {
              title: 'Test the SIM in a phone first.',
              text: 'Check that both SMS and mobile data work. Disable the SIM PIN and use the correct SIM size for the tracker. Record which SIM belongs to which car.',
              expected:
                'The SIM can receive a text message and open a webpage using mobile data.'
            },
            {
              title: 'Have an electrician install the tracker.',
              text: 'Use the exact unit’s diagram, voltage range, and fuse requirements. Mount it securely, with its antenna side toward the sky and away from metal shielding, heat, and moving parts.',
              expected:
                'The tracker has reliable power. The ignition-sensing wire is connected correctly. Unused wires are insulated.'
            },
            {
              title: 'Ask technical support to check the GPS server.',
              text: 'The connection recorded in this guide is 104.198.172.49, port 5013, verified on 6 November 2026. Ask support to confirm the current address before configuring a new batch.',
              expected:
                'The existing server is running and ready to receive tracker messages.'
            }
          ]
        },
        {
          kind: 'callout',
          tone: 'info',
          title: 'Send messages to the tracker’s SIM number.',
          text: 'Use your phone’s Messages app. Send one command at a time and wait for SET OK before continuing. These examples use the factory password 0000. If it was changed, ask support to prepare commands using the current password.'
        },
        {
          kind: 'code',
          label: 'Mobile data message',
          code: '8030000 internet',
          description:
            'Use this only if the SIM provider confirms the APN is internet. Otherwise replace the word internet with the provider’s APN before sending.'
        },
        {
          kind: 'code',
          label: 'Online reporting message',
          code: '7100000',
          description: 'Enables sending reports over mobile data.'
        },
        {
          kind: 'code',
          label: 'MMS server message',
          code: '8040000 104.198.172.49 5013',
          description:
            'Tells the tracker where to send its positions. Use the address confirmed by support.'
        },
        {
          kind: 'code',
          label: 'Ignition-on reporting message',
          code: '8050000 30',
          description:
            'Requests a report every 30 seconds while the ignition is on.'
        },
        {
          kind: 'code',
          label: 'Ignition-off reporting message',
          code: '8090000 180',
          description:
            'Requests a report every 180 seconds, or 3 minutes, while the ignition is off.'
        },
        {
          kind: 'code',
          label: 'Tracker clock message',
          code: '8960000E00',
          description:
            'Keeps the tracker’s clock on UTC. MMS displays times in your browser’s timezone.'
        },
        {
          kind: 'code',
          label: 'Check saved settings message',
          code: 'RCONF',
          description:
            'Send this after the setting commands. Ask support to compare the reply with the expected settings below.'
        },
        {
          kind: 'code',
          label: 'Expected settings in the reply',
          code: 'MODE:GPRS\nAPN:internet\nIP:104.198.172.49,5013\nGPRS UPLOAD TIME:30,180\nTIME ZONE:E00',
          description:
            'APN must match your SIM provider. SET OK means a setting was accepted; RCONF shows saved settings. Neither alone proves that a location reached MMS.'
        },
        {
          kind: 'text',
          text: 'Keep the tracker powered outdoors while testing. A solid blue light is a useful GPS-fix clue on this model. Always finish the app checks in “Check that it works.”'
        }
      ]
    },
    {
      id: 'register',
      title: 'Register it in MMS',
      summary: 'Create the device record and assign it to the correct car.',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Use the new tracker’s reported ID.',
          text: 'Ask technical support for the exact device ID received by the GPS server. It can differ from the full IMEI printed on the tracker. Enter that reported ID in the app’s IMEI field. Do not copy another tracker’s ID.'
        },
        {
          kind: 'steps',
          items: [
            {
              title: 'Sign in as an Admin.',
              text: 'Open MMS and sign in using an Admin account.'
            },
            {
              title: 'Check the vehicle record.',
              text: 'Open Vehicles. Confirm the car’s make, model, plate number, and recorded odometer. These are vehicle records; the tracker does not fill them in.'
            },
            {
              title: 'Register the device.',
              text: 'Open Trackers, then Register Device. Enter the reported ID in IMEI, add a useful label such as the vehicle plate, and record the SIM number.'
            },
            {
              title: 'Assign the car and save.',
              text: 'Choose the correct vehicle. Set the tracker status to Active, then save.',
              expected:
                'The device appears under Trackers with the correct vehicle and Active status.'
            },
            {
              title: 'Ask support to refresh the server’s device lookup.',
              text: 'Support can restart the existing GPS service using the command in the technical chapter. Existing trackers may briefly reconnect as well.'
            }
          ]
        },
        {
          kind: 'callout',
          tone: 'info',
          title: 'Replacing an old tracker?',
          text: 'Only one active tracker can be assigned to a vehicle. Mark the previous tracker Inactive before assigning the replacement. Keep each tracker’s own ID.'
        },
        { kind: 'link', label: 'Open Trackers', href: '/tracker-devices' },
        { kind: 'link', label: 'Open Vehicles', href: '/vehicles' }
      ]
    },
    {
      id: 'verify',
      title: 'Check that it works',
      summary:
        'Confirm the real location, recent updates, and the correct vehicle assignment.',
      blocks: [
        {
          kind: 'steps',
          items: [
            {
              title: 'Allow time for the next report.',
              text: 'Keep the tracker powered outdoors. With the settings in this guide, allow up to 3 minutes for the next ignition-off report.'
            },
            {
              title: 'Check the device in Trackers.',
              text: 'Refresh the Trackers page. Check the vehicle assignment, Active status, and Last Seen time.',
              expected:
                'The correct vehicle is assigned and Last Seen is recent.'
            },
            {
              title: 'Check the actual location.',
              text: 'Open GPS Map and select the vehicle. Compare the marker with the car’s real location. Watch the Last update time.',
              expected:
                'The marker is in the right place and its update time advances.'
            },
            {
              title: 'Do a short movement test.',
              text: 'Ask a passenger or helper to monitor MMS while the vehicle is moved safely. Check that the marker changes position and the speed reading changes.',
              expected:
                'New reports follow the vehicle rather than staying at an old location.'
            },
            {
              title: 'Compare ignition information.',
              text: 'Compare the reported ignition state with the car’s actual ignition. If they disagree, ask the electrician to check the ACC, or ignition-sensing, connection.'
            }
          ]
        },
        {
          kind: 'table',
          headings: ['Label or reading', 'What it means'],
          rows: [
            [
              'Active',
              'The tracker is enabled in MMS. This does not prove it is currently connected.'
            ],
            [
              'Online',
              'The tracker contacted the system recently. Check the position’s own time as well.'
            ],
            ['Last Seen', 'When MMS last heard from the tracker.'],
            [
              'Last update / position time',
              'When the displayed GPS position was recorded. An old position is not a current location.'
            ],
            [
              'Unknown',
              'That reading was not supplied. It does not mean zero or ignition off.'
            ],
            [
              '0 km/h / heading 0°',
              'Valid measured values. Zero heading means north.'
            ],
            [
              'Ready / On trip / In the shop',
              'Vehicle workflow status in MMS. This is separate from movement and ignition.'
            ]
          ]
        },
        {
          kind: 'text',
          text: 'MMS shows timestamps in your browser’s timezone. An operator abroad may see a different clock time from an operator in the Philippines. The times can still refer to the same report.'
        },
        { kind: 'link', label: 'Open GPS Map', href: '/gps-map' }
      ]
    },
    {
      id: 'troubleshoot',
      title: 'Fix a problem',
      summary: 'Open the matching question for a short next step.',
      blocks: [
        {
          kind: 'faq',
          items: [
            {
              question: 'The tracker does not reply to my text messages.',
              answer:
                'Check the SIM number, tracker power, cellular reception, and SMS credit or service. Confirm the command password. Test the SIM in a phone if needed.'
            },
            {
              question:
                'It replied SET OK, but the app still shows no location.',
              answer:
                'SET OK only confirms that a setting was accepted. Send RCONF for the saved settings. Check mobile data and APN, move the tracker outdoors, and ask support to confirm that reports reach the server.'
            },
            {
              question: 'RCONF still shows the old server address.',
              answer:
                'Wait for the server-setting acknowledgement, then request a fresh RCONF. Compare its IP and port with the address confirmed by support.'
            },
            {
              question:
                'The tracker is Online, but the map position is old or missing.',
              answer:
                'Online and a fresh GPS position are different checks. Keep the tracker outdoors and check the position timestamp. Ask support to check incoming position reports, assignment, and forwarding errors.'
            },
            {
              question: 'The server says unregistered/unassigned.',
              answer:
                'Ask support to copy the exact ID from that message. Check that it matches the IMEI field in MMS, that the device is Active, and that it has the correct vehicle assignment. Refresh the server lookup after saving.'
            },
            {
              question: 'The ignition state looks wrong.',
              answer:
                'Ask the electrician to compare the ACC wire connection with the car’s ignition state. Tracker power alone does not mean ignition is on.'
            },
            {
              question: 'The map shows an unrelated vehicle or an old date.',
              answer:
                'Check the vehicle assignment and the position’s timestamp. Do not use an old report as proof of the car’s current location.'
            },
            {
              question: 'The server shows unknown frame with V6, V8, or H1.',
              answer:
                'Technical support should check the installed gateway version. The working ST-901L-X decoder supports these messages; an older copy may reject them.'
            },
            {
              question: 'Can I close Cloud Shell or press Ctrl+C?',
              answer:
                'Yes. Ctrl+C while watching logs stops the log viewer. Closing Cloud Shell does not stop the separate cloud server. Tracking still requires the server, tracker power, SIM data, and MMS services to remain available.'
            }
          ]
        },
        {
          kind: 'callout',
          tone: 'info',
          title: 'When asking for help',
          text: 'Share the tracker model, reported device ID, vehicle plate, what you tried, and the relevant error. Include MODE, APN, and IP/port if needed. Remove the SMS password and personal phone numbers from shared replies.'
        }
      ]
    },
    {
      id: 'technical',
      title: 'For technical support',
      summary:
        'Cloud Shell checks, wiring reference, and service commands. Most operators can skip this chapter.',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'These commands run on the existing shared server.',
          text: 'Use the um-mms-gps Google Cloud project. Do not create another server for each tracker. A gateway restart may briefly interrupt reports from all connected trackers.'
        },
        {
          kind: 'code',
          label: 'Check server and public IP',
          code: `gcloud compute instances describe mms-gps-gateway \\\n${cloud} \\\n  --format="table(name,status,networkInterfaces[0].accessConfigs[0].natIP)"`,
          description:
            'Expect RUNNING and the confirmed public IP. If it differs from 104.198.172.49, verify the reserved address before changing trackers.'
        },
        {
          kind: 'code',
          label: 'Start a stopped server',
          code: `gcloud compute instances start mms-gps-gateway \\\n${cloud}`,
          description:
            'If Google reports billing is disabled, restore billing on this project first.'
        },
        {
          kind: 'code',
          label: 'Check the GPS service',
          code: `${ssh}  --command="sudo systemctl status mms-gps-gateway --no-pager"`,
          description:
            'Expect active (running) and GPS gateway listening on tcp/5013.'
        },
        {
          kind: 'code',
          label: 'Watch incoming tracker messages',
          code: `${ssh}  --command="sudo journalctl -u mms-gps-gateway -n 10 -f --no-pager"`,
          description:
            'An unregistered/unassigned message contains the new tracker’s reported ID. Copy that exact ID for registration. Ctrl+C stops this viewer without stopping the service.'
        },
        {
          kind: 'code',
          label: 'Refresh device lookup after registration',
          code: `${ssh}  --command="sudo systemctl restart mms-gps-gateway"`,
          description:
            'Restart after the device has been saved and assigned. The service is enabled to start when the VM boots.'
        },
        {
          kind: 'table',
          headings: [
            'Wire on the ST-901L four-wire harness',
            'Function to verify against the exact unit’s diagram'
          ],
          rows: [
            ['Red', 'Fused vehicle battery positive'],
            ['Black', 'Ground or battery negative'],
            ['Orange', 'ACC / ignition sensing'],
            [
              'Yellow',
              'Optional relay control; not required for location tracking'
            ]
          ]
        },
        {
          kind: 'text',
          text: 'An automotive electrician must confirm the unit’s voltage and fuse requirements and identify the car’s wires properly. Do not identify vehicle ignition wires by color alone. Insulate unused leads. Relay installation and engine immobilization are separate jobs and are not required for MMS tracking.'
        },
        {
          kind: 'text',
          text: 'On this model, solid blue indicates a GPS fix and blinking blue indicates acquisition or no fix. The orange indicator concerns the cellular module. Lights alone do not prove an upload reached MMS. The ST-901L-X gateway accepts V6 and V8 position messages and H1 heartbeats.'
        },
        {
          kind: 'text',
          text: 'If speed is consistently scaled incorrectly, check the gateway’s SPEED_UNIT setting. It is shared by connected trackers. The private gateway key stays on the server; a browser does not need it.'
        }
      ]
    },
    {
      id: 'reference',
      title: 'Working setup and references',
      summary:
        'The verified connection, cleanup history, and original technical documents.',
      blocks: [
        {
          kind: 'text',
          text: 'These values were verified on 6 November 2026. They are a reference snapshot, not a live server-status display.'
        },
        {
          kind: 'table',
          headings: ['Item', 'Verified value'],
          rows: [
            ['Tracker model / firmware', 'SinoTrack ST-901L-X / V5.25'],
            [
              'Existing reported device ID',
              '9170274546 — belongs to the existing tracker; do not reuse it'
            ],
            ['Existing vehicle', 'Toyota Hiace — MMS-0001'],
            ['GPS server / TCP port', '104.198.172.49 / 5013'],
            ['Existing SIM APN', 'internet'],
            ['Reporting mode / clock', 'GPRS / UTC (E00)'],
            [
              'Report intervals',
              '30 seconds ignition on; 180 seconds ignition off'
            ],
            [
              'Cloud project / VM / zone',
              'um-mms-gps / mms-gps-gateway / us-central1-a'
            ],
            ['Background service', 'mms-gps-gateway.service']
          ]
        },
        {
          kind: 'text',
          text: 'The tracker sends locations over its SIM to the GPS server. That server forwards reports to the MMS backend, where they are stored for the app. The setup computer and an open browser are not part of this reporting path.'
        },
        {
          kind: 'text',
          text: 'The cleanup removed 1,722 identified simulated GPS points while keeping real tracker history. Recovery copies are stored in the protected gps_simulation_cleanup_backups table. Demo controls and generated readings were removed. Latest-position views exclude old unregistered or inactive tracker positions. The cleanup release 049599e was verified live on Render and the matching Vercel web deployment completed.'
        },
        {
          kind: 'text',
          text: 'For each new installation, record the vehicle plate, reported device ID, SIM number, carrier APN, installation date, and test result in your installation records. Do not include the SMS password in shared records.'
        },
        {
          kind: 'link',
          label: 'Original setup guide',
          href: repository + 'new-gps-tracker-setup.md'
        },
        {
          kind: 'link',
          label: 'Gateway deployment and maintenance',
          href: repository + 'gps-deployment.md'
        },
        {
          kind: 'link',
          label: 'Initial cloud setup',
          href: repository + 'real-gps-hardware-connection.md'
        },
        {
          kind: 'link',
          label: 'Simulated GPS history cleanup',
          href: repository + 'gps-history-cleanup.md'
        },
        {
          kind: 'link',
          label: 'ST-901L four-pin manufacturer manual',
          href: 'https://manuals.plus/m/360a01cbf0d3beb8ddedbd9e8d786a51c9d1a641b4b5769da681be44b4be9ece.pdf'
        }
      ]
    }
  ]
};
