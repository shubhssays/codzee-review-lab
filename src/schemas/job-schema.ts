import { z } from 'zod';

export const CreateJobSchema = z
  .strictObject({
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
