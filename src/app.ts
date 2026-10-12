import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { z } from 'zod';
import { JobService } from './services/job-service.js';
import { IJobRepository, InMemoryJobRepository } from './repositories/job-repository.js';
import { CreateJobSchema, JobPaginationQuerySchema } from './schemas/job-schema.js';

export interface CodeReview {
  id: string;
  title: string;
  repository: string;
  prNumber: number;
  author: string;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  score: number;
  comments?: string | undefined;
  createdAt: string;
}

const CreateReviewSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  repository: z.string().min(1, 'Repository is required'),
  prNumber: z.number().int().positive('PR number must be positive'),
  author: z.string().min(1, 'Author is required'),
  status: z.enum(['PENDING', 'APPROVED', 'CHANGES_REQUESTED']).default('PENDING'),
  score: z.number().min(0).max(100),
  comments: z.string().optional(),
});

export interface AppOptions extends FastifyServerOptions {
  jobService?: JobService;
  jobRepository?: IJobRepository;
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const { jobService: customJobService, jobRepository: customJobRepo, ...fastifyOpts } = opts;
  const app = Fastify(fastifyOpts);

  const jobRepository = customJobRepo ?? new InMemoryJobRepository();
  const jobService = customJobService ?? new JobService(jobRepository);

  // In-memory store for demonstration reviews
  const reviews: Map<string, CodeReview> = new Map([
    [
      'rev-1',
      {
        id: 'rev-1',
        title: 'Fix race condition in review worker',
        repository: 'codzee/engine',
        prNumber: 42,
        author: 'alice',
        status: 'APPROVED',
        score: 95,
        comments: 'Clean implementation with robust mutex locking.',
        createdAt: new Date().toISOString(),
      },
    ],
    [
      'rev-2',
      {
        id: 'rev-2',
        title: 'Add support for tsconfig path aliases',
        repository: 'codzee/cli',
        prNumber: 108,
        author: 'bob',
        status: 'PENDING',
        score: 80,
        createdAt: new Date().toISOString(),
      },
    ],
  ]);

  // Health check endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // ==================== Job Endpoints ====================

  // POST /jobs - Create a new job
  app.post('/jobs', async (request, reply) => {
    const parseResult = CreateJobSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid job payload',
        details: parseResult.error.issues,
      });
    }

    const createdJob = await jobService.createJob(parseResult.data);
    return reply.status(201).send(createdJob);
  });

  // GET /jobs/:id - Get a single job by ID
  app.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    const job = await jobService.getJobById(id);

    if (!job) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Job with ID '${id}' was not found.`,
      });
    }

    return reply.status(200).send(job);
  });

  // GET /jobs - List jobs with limit & offset pagination
  app.get('/jobs', async (request, reply) => {
    const parseResult = JobPaginationQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid pagination query parameters',
        details: parseResult.error.issues,
      });
    }

    const { limit, offset } = parseResult.data;
    const result = await jobService.listJobs({ limit, offset });
    return reply.status(200).send(result);
  });

  // ==================== Review Endpoints ====================

  // Get all reviews (with optional author query filter)
  app.get<{ Querystring: { author?: string; status?: string } }>(
    '/api/reviews',
    async (request) => {
      let result = Array.from(reviews.values());
      const { author, status } = request.query;

      if (author) {
        result = result.filter(
          (r) => r.author.toLowerCase() === author.toLowerCase()
        );
      }
      if (status) {
        result = result.filter(
          (r) => r.status.toUpperCase() === status.toUpperCase()
        );
      }

      return { reviews: result, total: result.length };
    }
  );

  // Get review by ID
  app.get<{ Params: { id: string } }>(
    '/api/reviews/:id',
    async (request, reply) => {
      const { id } = request.params;
      const review = reviews.get(id);

      if (!review) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Review with ID '${id}' was not found.`,
        });
      }

      return review;
    }
  );

  // Create review
  app.post('/api/reviews', async (request, reply) => {
    const parseResult = CreateReviewSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid review payload',
        details: parseResult.error.issues,
      });
    }

    const data = parseResult.data;
    const newId = `rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newReview: CodeReview = {
      id: newId,
      title: data.title,
      repository: data.repository,
      prNumber: data.prNumber,
      author: data.author,
      status: data.status,
      score: data.score,
      comments: data.comments,
      createdAt: new Date().toISOString(),
    };

    reviews.set(newId, newReview);
    return reply.status(201).send(newReview);
  });

  // Delete review
  app.delete<{ Params: { id: string } }>(
    '/api/reviews/:id',
    async (request, reply) => {
      const { id } = request.params;
      if (!reviews.has(id)) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Review with ID '${id}' was not found.`,
        });
      }

      reviews.delete(id);
      return reply.status(200).send({
        message: `Review '${id}' deleted successfully.`,
        deletedId: id,
      });
    }
  );

  return app;
}
