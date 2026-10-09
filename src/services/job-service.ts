import { randomUUID } from 'node:crypto';
import { Job, PaginatedResult, PaginationOptions } from '../types/job.js';
import { CreateJobSchema } from '../schemas/job-schema.js';
import { IJobRepository } from '../repositories/job-repository.js';

export class JobService {
  constructor(private readonly jobRepository: IJobRepository) {}

  async createJob(rawInput: unknown): Promise<Job> {
    const validatedInput = CreateJobSchema.parse(rawInput);
    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      type: validatedInput.type,
      payload: validatedInput.payload,
      status: 'QUEUED',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    return this.jobRepository.create(job);
  }

  async getJobById(id: string): Promise<Job | null> {
    return this.jobRepository.findById(id);
  }

  async listJobs(options?: PaginationOptions): Promise<PaginatedResult<Job>> {
    return this.jobRepository.list(options);
  }
}
