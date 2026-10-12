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

export const JobPaginationQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      const num = typeof val === 'number' ? val : Number(val);
      return isNaN(num) ? NaN : num;
    })
    .pipe(
      z
        .number({ message: 'limit must be a number' })
        .int('limit must be an integer')
        .positive('limit must be greater than 0')
        .max(100, 'limit cannot exceed 100')
        .optional()
    ),
  offset: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      const num = typeof val === 'number' ? val : Number(val);
      return isNaN(num) ? NaN : num;
    })
    .pipe(
      z
        .number({ message: 'offset must be a number' })
        .int('offset must be an integer')
        .min(0, 'offset must be greater than or equal to 0')
        .optional()
    ),
});

export type JobPaginationQueryInput = z.infer<typeof JobPaginationQuerySchema>;
