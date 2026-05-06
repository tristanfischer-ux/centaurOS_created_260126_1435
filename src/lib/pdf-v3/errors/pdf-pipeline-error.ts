export class PdfPipelineError extends Error {
  public constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'PdfPipelineError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PdfPipelineError);
    }
  }
}
