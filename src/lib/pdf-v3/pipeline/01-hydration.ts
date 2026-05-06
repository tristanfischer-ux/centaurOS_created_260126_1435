import { PdfPipelineError } from '../errors/pdf-pipeline-error';
import { rawPdfDataSchema, HydratedProjectData } from '../types/raw-schema';
import { z } from 'zod';

export function hydrateAndCoerce(raw: unknown): HydratedProjectData {
  try {
    return rawPdfDataSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PdfPipelineError(`Hydration failed: ${error.message}`, error);
    }
    throw new PdfPipelineError('Hydration failed due to an unknown error', error);
  }
}
