-- @file 20260421000000_report_downloads_html.sql
-- @description Extend the file_format CHECK on report_downloads to accept
-- 'html'. Needed so the new print-HTML export variant can be recorded
-- alongside docx/pptx/pdf in the download history.

ALTER TABLE public.report_downloads
  DROP CONSTRAINT IF EXISTS chk_file_format;

ALTER TABLE public.report_downloads
  ADD CONSTRAINT chk_file_format
    CHECK (file_format IN ('docx', 'pptx', 'pdf', 'csv', 'png', 'html'));
