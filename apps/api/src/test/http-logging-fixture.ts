import express from 'express';
import { createApp } from '../app.js';

// Run in a child process so this checks production logging, which the API test
// runner deliberately disables. Only synthetic credentials enter this fixture.
const server = express();
server.use((_req, res, next) => {
  res.setHeader('Set-Cookie', [
    'mms_refresh=synthetic-response-refresh; HttpOnly; Path=/api/auth',
    'mms_test_account_grant=synthetic-response-grant; HttpOnly; Path=/api/auth'
  ]);
  next();
});
server.use(createApp());

const listener = server.listen(0, '127.0.0.1', async () => {
  try {
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/health`,
      {
        headers: {
          Authorization: 'Bearer synthetic-access-token',
          Cookie:
            'mms_refresh=synthetic-request-refresh; mms_test_account_grant=synthetic-request-grant',
          'x-device-api-key': 'synthetic-device-key',
          'x-request-id': 'public-request-metadata'
        }
      }
    );
    if (response.status !== 200) throw new Error('Health failed');
    await response.text();
  } catch {
    process.exitCode = 1;
  } finally {
    listener.close();
  }
});
