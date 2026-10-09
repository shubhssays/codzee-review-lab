import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { z } from 'zod';

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

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  // In-memory store for demonstration
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
