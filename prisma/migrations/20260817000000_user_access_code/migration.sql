-- Additive, nullable, unique short-access-code for the Promoter Portal short-link login (/p/[code]).
-- Applied directly against the dev DB via psql (not `prisma migrate dev`) because this database already has
-- 10 migrations applied (Goals/ActionPlan/Settlement/Commission work) that are missing from this working tree's
-- prisma/migrations/ folder — `prisma migrate dev` refuses with a drift error asking for a destructive reset.
-- This file documents the exact SQL that was run, for whoever reconciles that pre-existing drift later.
ALTER TABLE "User" ADD COLUMN "accessCode" TEXT;
CREATE UNIQUE INDEX "User_accessCode_key" ON "User"("accessCode");
