-- Drop vestigial file_url column from report_downloads.
-- Signed URLs are generated on-demand in getReportDownloads() — this column
-- was always set to NULL and serves no purpose.
ALTER TABLE report_downloads DROP COLUMN IF EXISTS file_url;
