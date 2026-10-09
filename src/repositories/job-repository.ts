import { Job, PaginatedResult, PaginationOptions } from '../types/job.js';

export interface IJobRepository {
  create(job: Job): Promise<Job>;
  findById(id: string): Promise<Job | null>;
  list(options?: PaginationOptions): Promise<PaginatedResult<Job>>;
}

export class InMemoryJobRepository implements IJobRepository {
  private readonly storage: Map<string, Job>;

  constructor() {
    this.storage = new Map<string, Job>();
  }

  async create(job: Job): Promise<Job> {
    const storedJob: Job = {
      ...job,
      payload: { ...job.payload },
    };
    this.storage.set(job.id, storedJob);
    return {
      ...storedJob,
      payload: { ...storedJob.payload },
    };
  }

  async findById(id: string): Promise<Job | null> {
    const job = this.storage.get(id);
    if (!job) {
      return null;
    }
    return {
      ...job,
      payload: { ...job.payload },
    };
  }

  async list(options: PaginationOptions = {}): Promise<PaginatedResult<Job>> {
    const limit = options.limit !== undefined && options.limit > 0 ? options.limit : 20;
    const offset = options.offset !== undefined && options.offset >= 0 ? options.offset : 0;

    const allJobs = Array.from(this.storage.values());
    const total = allJobs.length;
    const items = allJobs
      .slice(offset, offset + limit)
      .map((job) => ({
        ...job,
        payload: { ...job.payload },
      }));

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}
