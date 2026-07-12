import 'dotenv/config';
import { loadConfig } from './config.js';
import { startGateway } from './gateway.js';

const config = loadConfig();
void startGateway(config).then(() => {
  console.log(`GPS gateway listening on tcp/${config.tcpPort} → ${config.apiUrl}`);
});
