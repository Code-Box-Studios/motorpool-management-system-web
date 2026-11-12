-- Invalidate previously issued credentials after an account authority change.
ALTER TABLE "users" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;
