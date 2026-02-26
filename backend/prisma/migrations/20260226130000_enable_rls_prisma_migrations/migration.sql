-- Enable RLS on Prisma's internal migrations table (fixes Security Advisor "RLS Disabled in Public" for public._prisma_migrations).
-- The app connects as postgres (superuser), so Prisma Migrate continues to work.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
