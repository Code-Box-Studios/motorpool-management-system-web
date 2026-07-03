import { existsSync, rmSync } from 'node:fs';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createUploader, publicUploadPath } from './uploads.js';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function buildApp() {
  const app = express();
  const upload = createUploader('test');
  app.post('/upload', upload.single('image'), (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: 'No file' } });
      return;
    }
    res.json({ path: publicUploadPath('test', file.filename) });
  });
  app.use(errorHandler);
  return app;
}

describe('upload infrastructure', () => {
  afterAll(() => rmSync(config.uploadsDir, { recursive: true, force: true }));

  it('stores an allowed image and returns its public path', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^\/uploads\/test\/[\w-]+\.png$/);
    const onDisk = res.body.path.replace('/uploads/', `${config.uploadsDir}/`);
    expect(existsSync(onDisk)).toBe(true);
  });

  it('derives the stored extension from the validated mimetype, not the client filename', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', PNG, { filename: 'evil.html', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/\.png$/);
  });

  it('rejects a disallowed mimetype with 400 INVALID_FILE_TYPE', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', Buffer.from('%PDF-1.4'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf'
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects an oversized file with 400 UPLOAD_ERROR', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const res = await request(buildApp())
      .post('/upload')
      .attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPLOAD_ERROR');
  });

  it('serves stored files at /uploads with a cross-origin resource policy', async () => {
    const uploaded = await request(buildApp())
      .post('/upload')
      .attach('image', PNG, { filename: 'photo.png', contentType: 'image/png' });
    // the REAL app (with helmet) must serve it embeddable cross-origin
    const { createApp } = await import('../app.js');
    const res = await request(createApp()).get(uploaded.body.path as string);
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
