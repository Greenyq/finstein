-- Add milestonesCelebrated column to User table
-- Stores a JSON array of milestone keys that have already been celebrated
ALTER TABLE "User" ADD COLUMN "milestonesCelebrated" TEXT NOT NULL DEFAULT '[]';
