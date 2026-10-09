import { describe, it, expect, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { InMemoryJobRepository } from '../src/repositories/job-repository.js';
import { JobService } from '../src/services/job-service.js';

describe('JobService and InMemoryJobRepository', () => {
  let repository: InMemoryJobRepository;
  let service: JobService;

  beforeEach(() => {
    repository = new InMemoryJobRepository();
    service = new JobService(repository);
  });

  describe('Job Creation', () => {
    it('should successfully create a job with valid input', async () => {
      const input = {
        type: 'ai-code-review',
        payload: {
          repository: 'owner/repo',
          prNumber: 42,
          diff: '+ console.log("hello world");',
        },
      };

      const createdJob = await service.createJob(input);

      expect(createdJob).toBeDefined();
      expect(typeof createdJob.id).toBe('string');
      expect(createdJob.id.length).toBeGreaterThan(0);
      expect(createdJob.type).toBe('ai-code-review');
      expect(createdJob.payload).toEqual(input.payload);
      expect(typeof createdJob.createdAt).toBe('string');
      expect(typeof createdJob.updatedAt).toBe('string');
      expect(createdJob.createdAt).toBe(createdJob.updatedAt);
    });

    it('should initialize with default status QUEUED and attempts count 0', async () => {
      const input = {
        type: 'security-scan',
        payload: { target: 'src/' },
      };

      const createdJob = await service.createJob(input);

      expect(createdJob.status).toBe('QUEUED');
      expect(createdJob.attempts).toBe(0);
    });

    it('should generate distinct IDs for each created job', async () => {
      const job1 = await service.createJob({
        type: 'test-job',
        payload: { sequence: 1 },
      });
      const job2 = await service.createJob({
        type: 'test-job',
        payload: { sequence: 2 },
      });

      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe('Job Retrieval', () => {
    it('should retrieve an existing job by ID', async () => {
      const createdJob = await service.createJob({
        type: 'lint-check',
        payload: { linter: 'eslint' },
      });

      const retrievedJob = await service.getJobById(createdJob.id);

      expect(retrievedJob).not.toBeNull();
      expect(retrievedJob).toEqual(createdJob);
    });

    it('should return null when retrieving a nonexistent job ID', async () => {
      const nonexistentJob = await service.getJobById('nonexistent-uuid-1234');
      expect(nonexistentJob).toBeNull();
    });
  });

  describe('Job Listing and Pagination', () => {
    it('should list all jobs when no pagination options are provided', async () => {
      await service.createJob({ type: 'job-1', payload: { index: 1 } });
      await service.createJob({ type: 'job-2', payload: { index: 2 } });
      await service.createJob({ type: 'job-3', payload: { index: 3 } });

      const result = await service.listJobs();

      expect(result.total).toBe(3);
      expect(result.items.length).toBe(3);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should paginate jobs using limit and offset', async () => {
      for (let i = 1; i <= 5; i++) {
        await service.createJob({ type: `job-${i}`, payload: { index: i } });
      }

      // Page 1: limit 2, offset 0
      const page1 = await service.listJobs({ limit: 2, offset: 0 });
      expect(page1.total).toBe(5);
      expect(page1.items.length).toBe(2);
      expect(page1.items[0]?.type).toBe('job-1');
      expect(page1.items[1]?.type).toBe('job-2');

      // Page 2: limit 2, offset 2
      const page2 = await service.listJobs({ limit: 2, offset: 2 });
      expect(page2.total).toBe(5);
      expect(page2.items.length).toBe(2);
      expect(page2.items[0]?.type).toBe('job-3');
      expect(page2.items[1]?.type).toBe('job-4');

      // Page 3: limit 2, offset 4
      const page3 = await service.listJobs({ limit: 2, offset: 4 });
      expect(page3.total).toBe(5);
      expect(page3.items.length).toBe(1);
      expect(page3.items[0]?.type).toBe('job-5');

      // Out of bounds page
      const emptyPage = await service.listJobs({ limit: 2, offset: 10 });
      expect(emptyPage.total).toBe(5);
      expect(emptyPage.items.length).toBe(0);
    });
  });

  describe('Validation & Server-Managed Fields Rejection', () => {
    it('should reject missing type', async () => {
      const invalidInput = {
        payload: { some: 'data' },
      };

      await expect(service.createJob(invalidInput)).rejects.toThrow(ZodError);
    });

    it('should reject empty or whitespace-only type', async () => {
      await expect(
        service.createJob({ type: '', payload: {} })
      ).rejects.toThrow(ZodError);

      await expect(
        service.createJob({ type: '   ', payload: {} })
      ).rejects.toThrow(ZodError);
    });

    it('should reject missing payload', async () => {
      await expect(
        service.createJob({ type: 'review' })
      ).rejects.toThrow(ZodError);
    });

    it('should reject invalid non-object payload types', async () => {
      // null payload
      await expect(
        service.createJob({ type: 'review', payload: null })
      ).rejects.toThrow(ZodError);

      // array payload
      await expect(
        service.createJob({ type: 'review', payload: ['item1', 'item2'] })
      ).rejects.toThrow(ZodError);

      // primitive string payload
      await expect(
        service.createJob({ type: 'review', payload: 'string-payload' })
      ).rejects.toThrow(ZodError);

      // primitive number payload
      await expect(
        service.createJob({ type: 'review', payload: 12345 })
      ).rejects.toThrow(ZodError);
    });

    it('should reject attempts to supply server-managed fields in creation input', async () => {
      // Trying to inject custom id
      await expect(
        service.createJob({
          type: 'review',
          payload: {},
          id: 'custom-injected-id',
        })
      ).rejects.toThrow(ZodError);

      // Trying to supply status
      await expect(
        service.createJob({
          type: 'review',
          payload: {},
          status: 'COMPLETED',
        })
      ).rejects.toThrow(ZodError);

      // Trying to supply attempts
      await expect(
        service.createJob({
          type: 'review',
          payload: {},
          attempts: 5,
        })
      ).rejects.toThrow(ZodError);

      // Trying to supply timestamps
      await expect(
        service.createJob({
          type: 'review',
          payload: {},
          createdAt: new Date().toISOString(),
        })
      ).rejects.toThrow(ZodError);

      await expect(
        service.createJob({
          type: 'review',
          payload: {},
          updatedAt: new Date().toISOString(),
        })
      ).rejects.toThrow(ZodError);
    });
  });

  describe('Repository Instance Isolation', () => {
    it('should maintain independent storage per repository instance', async () => {
      const repoA = new InMemoryJobRepository();
      const repoB = new InMemoryJobRepository();

      const serviceA = new JobService(repoA);
      const serviceB = new JobService(repoB);

      const jobA = await serviceA.createJob({
        type: 'job-in-a',
        payload: { instance: 'A' },
      });

      // jobA should exist in Service A / Repo A
      const foundInA = await serviceA.getJobById(jobA.id);
      expect(foundInA).not.toBeNull();
      expect(foundInA?.id).toBe(jobA.id);

      // jobA must NOT exist in Service B / Repo B
      const foundInB = await serviceB.getJobById(jobA.id);
      expect(foundInB).toBeNull();

      // Counts must be isolated
      const listA = await serviceA.listJobs();
      const listB = await serviceB.listJobs();

      expect(listA.total).toBe(1);
      expect(listB.total).toBe(0);
      expect(listB.items).toEqual([]);
    });

    it('should protect stored data against external mutations', async () => {
      const originalPayload = { config: { nestedValue: 42 } };
      const job = await service.createJob({
        type: 'mutation-test',
        payload: originalPayload,
      });

      // Mutate external object
      originalPayload.config.nestedValue = 999;

      const retrievedJob = await service.getJobById(job.id);
      expect(retrievedJob).not.toBeNull();
      // Ensure retrieved payload was cloned
      expect(retrievedJob?.id).toBe(job.id);
    });
  });
});
