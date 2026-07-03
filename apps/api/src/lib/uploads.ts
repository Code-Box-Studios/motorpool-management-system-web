import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
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
export function createUploader(domain: string): multer.Multer {
  const dir = path.join(config.uploadsDir, domain);
  mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        // '.bin' is unreachable after fileFilter rejects unknown mimetypes;
        // it only satisfies noUncheckedIndexedAccess.
        const ext = EXTENSION_BY_MIME[file.mimetype] ?? '.bin';
        cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
      }
    }),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only jpeg, png, or webp images are allowed'));
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
