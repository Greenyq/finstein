-- AlterTable
ALTER TABLE "User" ADD COLUMN "familyId" TEXT,
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'owner',
ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "familyPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "authorName" TEXT;
