import 'dotenv/config';
import { loadConfig } from './config.js';
import { startGateway } from './gateway.js';

const config = loadConfig();
void startGateway(config)
  .then((server) => {
    console.log(
      `GPS gateway listening on tcp/${config.tcpPort} → ${config.apiUrl}`
    );
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        // Persisted receipts survive forced restarts too. Give active handlers a
        // chance to finish, but do not keep shutdown waiting on idle trackers.
        const deadline = setTimeout(
          () => process.exit(1),
          config.apiTimeoutMs * 5 + 2000
        );
        deadline.unref();
        void server
          .shutdown()
          .then(() => clearTimeout(deadline))
          .catch((error) => {
            console.error('GPS gateway shutdown failed:', error);
            process.exitCode = 1;
          });
      });
    }
  })
  .catch((error) => {
    console.error('GPS gateway startup failed:', error);
    process.exitCode = 1;
  });
