import { z } from 'zod';

export const CreateJobSchema = z.strictObject({
  type: z
    .string()
    .trim()
    .min(1, 'Job type must be a non-empty string'),
  payload: z
    .record(z.string(), z.unknown())
    .refine(
      (val) => val !== null && typeof val === 'object' && !Array.isArray(val),
      {
        message: 'Job payload must be a non-null object',
      }
    ),
});

export type CreateJobSchemaInput = z.infer<typeof CreateJobSchema>;

const toOptionalInteger = (val: unknown): unknown => {
  if (val === undefined) return undefined;
  if (typeof val === 'number') return Number.isSafeInteger(val) ? val : NaN;
  if (typeof val === 'string' && /^-?\d+$/.test(val.trim())) {
    const num = Number(val.trim());
    return Number.isSafeInteger(num) ? num : NaN;
  }
  return NaN;
};

export const JobPaginationQuerySchema = z.object({
  limit: z.preprocess(
    toOptionalInteger,
    z
      .number({ message: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be greater than 0')
      .max(100, 'limit cannot exceed 100')
      .optional()
  ),
  offset: z.preprocess(
    toOptionalInteger,
    z
      .number({ message: 'offset must be a number' })
      .int('offset must be an integer')
      .min(0, 'offset must be greater than or equal to 0')
      .optional()
  ),
});

export type JobPaginationQueryInput = z.infer<typeof JobPaginationQuerySchema>;
