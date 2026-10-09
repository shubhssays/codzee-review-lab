export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobInput {
  type: string;
  payload: Record<string, unknown>;
}

export interface PaginationOptions {
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
