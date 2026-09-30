-- Admin delisting: hides a market from the site; the resolver settles it INVALID at close.
ALTER TABLE "Market" ADD COLUMN "delistedAt" TIMESTAMP(3);
ALTER TABLE "Market" ADD COLUMN "delistReason" TEXT;
