import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error-handler.js';
import { createUploader, uploadedFileUrl } from './uploads.js';

const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock('@vercel/blob', () => blob);

function app() {
  const server = express();
  server.post(
    '/image',
    createUploader('avatars', {
      provider: 'vercel-blob',
      token: 'test-token'
    }).single('image'),
    (req, res) => {
      res.json({ url: uploadedFileUrl('avatars', req.file!) });
    }
  );
  server.use(errorHandler);
  return server;
}

describe('durable image uploads', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    blob.put.mockResolvedValue({
      url: 'https://test.public.blob.vercel-storage.com/mms/avatars/image.png'
    });
    blob.del.mockResolvedValue(undefined);
  });
  it('returns the durable HTTPS URL, retaining the validated content type', async () => {
    const response = await request(app())
      .post('/image')
      .attach('image', Buffer.from('image bytes'), {
        filename: 'bad.html',
        contentType: 'image/png'
      });
    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      'https://test.public.blob.vercel-storage.com/mms/avatars/image.png'
    );
    expect(blob.put).toHaveBeenCalledWith(
      expect.stringMatching(/^mms\/avatars\/[a-z0-9-]+\.png$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: 'public',
        contentType: 'image/png',
        token: 'test-token'
      })
    );
  });
  it('rejects oversized content without storing its truncated bytes', async () => {
    const response = await request(app())
      .post('/image')
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'big.png',
        contentType: 'image/png'
      });
    expect(response.status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });
  it('reports a retryable failure without leaking provider errors or falling back to ephemeral disk', async () => {
    blob.put.mockRejectedValue(new Error('provider private credentials'));
    const response = await request(app())
      .post('/image')
      .attach('image', Buffer.from('data'), {
        filename: 'photo.png',
        contentType: 'image/png'
      });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('UPLOAD_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('credentials');
  });
  it('cleans a stored object when multipart validation rejects a later file', async () => {
    const response = await request(app()).post('/image')
      .attach('image', Buffer.from('first'), { filename: 'one.png', contentType: 'image/png' })
      .attach('image', Buffer.from('second'), { filename: 'two.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect(blob.del).toHaveBeenCalledWith('https://test.public.blob.vercel-storage.com/mms/avatars/image.png', { token: 'test-token' });
  });
  it('refuses durable mode without its server token', () => {
    expect(() => createUploader('avatars', { provider: 'vercel-blob' })).toThrow(/server storage token/);
  });
});
