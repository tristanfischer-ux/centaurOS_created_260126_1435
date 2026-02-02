-- Add 'Founder' to member_role enum
-- Separated from RBAC policies to avoid transaction issues with enum modification

ALTER TYPE "public"."member_role" ADD VALUE IF NOT EXISTS 'Founder';
