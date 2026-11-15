# Durable image storage

The API supports `UPLOADS_PROVIDER=local` for development and
`UPLOADS_PROVIDER=vercel-blob` for durable production uploads. The existing
5 MB limit and JPEG, PNG, and WebP validation apply to both providers.

## Production activation

1. Create a public Vercel Blob store in the owning MMS account. Uploaded fleet
   photos and avatars already use public image URLs; do not use this store for
   private documents.
2. Store its read-write token as `BLOB_READ_WRITE_TOKEN` on the API host, then
   set `UPLOADS_PROVIDER=vercel-blob`. Keep the token out of browser variables,
   repository files, screenshots, and logs. Startup fails if this provider is
   selected without its token.
3. Deploy the API and upload an image. Confirm the saved record contains an
   HTTPS Blob URL. Restart the API and confirm that URL still loads. Check both
   profile images and multi-image vehicle uploads.
4. Monitor the store's usage. Hobby has hard usage limits; storage failures
   return a retryable 503 rather than falling back to ephemeral disk.

The SDK supports API servers hosted outside Vercel using the server token.
See [SDK authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk#authentication)
and [current usage limits](https://vercel.com/docs/vercel-blob/usage-and-pricing).

## Existing images

Existing `/uploads/...` references continue to load from `UPLOADS_DIR`. Switching
providers does not copy those files. Preserve any surviving source directory or
persistent disk before changing hosts. Re-upload original images through the
normal edit forms to replace their references with durable URLs.

One production avatar URL returned 404 during the November 13 audit. The original
bytes were not available in this checkout, so the adapter cannot restore that
image. Its original file must be re-uploaded. Production activation and restart
verification require access to the API host and Blob store; neither was changed
while preparing this fix.
