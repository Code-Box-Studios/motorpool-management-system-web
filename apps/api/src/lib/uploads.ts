import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import multer from 'multer';
import { put, del } from '@vercel/blob';
import { config } from '../config.js';
import { AppError } from './errors.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Maps a validated mimetype to its on-disk extension — NEVER trust the
// client-supplied filename/extension (it can be spoofed to smuggle in an
// .html file that express.static would serve as same-origin text/html).
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

// Multer instance persisting files to <UPLOADS_DIR>/<domain>/ (spec §9).
interface UploadSettings {
  provider: 'local' | 'vercel-blob';
  token?: string;
}

interface PendingUpload {
  domain: string;
  file: Express.Multer.File;
  storage: multer.StorageEngine;
}
const pendingUploads = new WeakMap<Request, PendingUpload[]>();

/** Called after the owning database write succeeds, before sending a response. */
export function retainUploadedFiles(req: Request): void {
  pendingUploads.delete(req);
}

/** Downstream errors do not invoke Multer's multipart-only removal hook. */
export async function cleanupFailedUploads(req: Request): Promise<void> {
  const uploads = pendingUploads.get(req) ?? [];
  pendingUploads.delete(req);
  await Promise.all(
    uploads.map(async (upload) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Disk storage removes fields from its file object, so every attempt
          // receives a fresh copy of the original stored path.
          await new Promise<void>((resolve, reject) => {
            upload.storage._removeFile(req, { ...upload.file }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          return;
        } catch {
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 25 * (attempt + 1))
            );
          }
        }
      }
      // Preserve the original domain error. Record only generated public paths,
      // never SDK errors, request headers or provider tokens.
      const record = {
        event: 'upload_cleanup_failed',
        domain: upload.domain,
        path: uploadedFileUrl(upload.domain, upload.file),
        attempts: 3
      };
      if (req.log) req.log.error(record, 'Uncommitted image cleanup failed');
      else console.error('Uncommitted image cleanup failed', record);
    })
  );
}

function trackedStorage(
  domain: string,
  storage: multer.StorageEngine
): multer.StorageEngine {
  return {
    _handleFile(req, file, callback) {
      storage._handleFile(req, file, (error, info) => {
        if (!error && info?.path && info.filename) {
          const uploads = pendingUploads.get(req) ?? [];
          uploads.push({
            domain,
            storage,
            file: { ...file, ...info } as Express.Multer.File
          });
          pendingUploads.set(req, uploads);
        }
        callback(error, info);
      });
    },
    _removeFile(req, file, callback) {
      const originalPath = file.path;
      storage._removeFile(req, { ...file }, (error) => {
        if (!error) {
          const remaining = (pendingUploads.get(req) ?? []).filter(
            (upload) => upload.file.path !== originalPath
          );
          if (remaining.length) pendingUploads.set(req, remaining);
          else pendingUploads.delete(req);
        }
        callback(error);
      });
    }
  };
}

function durableStorage(domain: string, token: string): multer.StorageEngine {
  return {
    _handleFile(req, file, callback) {
      let chunks: Buffer[] = [];
      let size = 0;
      let limited = false;
      const controller = new AbortController();
      const onAborted = () => controller.abort();
      req.once('aborted', onAborted);
      file.stream.once('limit', () => {
        limited = true;
        chunks = [];
      });
      file.stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (!limited) chunks.push(chunk);
      });
      file.stream.once('error', (error) => {
        req.off('aborted', onAborted);
        callback(error);
      });
      file.stream.once('end', () => {
        if (limited) {
          req.off('aborted', onAborted);
          callback(new multer.MulterError('LIMIT_FILE_SIZE'));
          return;
        }
        const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${EXTENSION_BY_MIME[file.mimetype]}`;
        const content = Buffer.concat(chunks);
        chunks = [];
        void put(`mms/${domain}/${filename}`, content, {
          access: 'public',
          token,
          contentType: file.mimetype,
          addRandomSuffix: false,
          abortSignal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30_000)
          ])
        })
          .then(
            (blob) => callback(null, { filename, path: blob.url, size }),
            () => {
              callback(
                new AppError(
                  503,
                  'UPLOAD_UNAVAILABLE',
                  'Image storage is unavailable. Please try again.'
                )
              );
            }
          )
          .finally(() => req.off('aborted', onAborted));
      });
    },
    _removeFile(_req, file, callback) {
      void del(file.path, { token }).then(
        () => callback(null),
        () =>
          callback(
            new AppError(
              503,
              'UPLOAD_UNAVAILABLE',
              'Image cleanup failed. Please try again.'
            )
          )
      );
    }
  };
}

export function createUploader(
  domain: string,
  settings: UploadSettings = {
    provider: config.uploadsProvider,
    token: config.blobReadWriteToken
  }
): multer.Multer {
  if (settings.provider === 'vercel-blob' && !settings.token) {
    throw new Error(
      'A server storage token is required for vercel-blob uploads'
    );
  }
  const dir = path.join(config.uploadsDir, domain);
  if (settings.provider === 'local') mkdirSync(dir, { recursive: true });
  return multer({
    storage: trackedStorage(
      domain,
      settings.provider === 'vercel-blob'
        ? durableStorage(domain, settings.token!)
        : multer.diskStorage({
            destination: dir,
            filename: (_req, file, cb) => {
              // '.bin' is unreachable after fileFilter rejects unknown mimetypes;
              // it only satisfies noUncheckedIndexedAccess.
              const ext = EXTENSION_BY_MIME[file.mimetype] ?? '.bin';
              cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
            }
          })
    ),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(
          new AppError(
            400,
            'INVALID_FILE_TYPE',
            'Only jpeg, png, or webp images are allowed'
          )
        );
        return;
      }
      cb(null, true);
    }
  });
}

// The URL path stored in the DB for an uploaded file.
export function publicUploadPath(domain: string, filename: string): string {
  return `/uploads/${domain}/${filename}`;
}

/** Remote storage provides an absolute URL; disk uploads retain their existing public path. */
export function uploadedFileUrl(
  domain: string,
  file: Pick<Express.Multer.File, 'filename' | 'path'>
): string {
  return file.path?.startsWith('https://')
    ? file.path
    : publicUploadPath(domain, file.filename);
}
