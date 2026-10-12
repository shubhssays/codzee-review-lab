import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Fastify HTTP Endpoints with Injection API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Build Fastify instance without binding to a network port or starting a server process
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status without starting a separate server process', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const payload = response.json();
      expect(payload.status).toBe('ok');
      expect(typeof payload.uptime).toBe('number');
      expect(typeof payload.timestamp).toBe('string');
    });
  });

  describe('Job Endpoints', () => {
    describe('POST /jobs', () => {
      it('should successfully create a job and return 201 with default status QUEUED and attempts 0', async () => {
        const jobInput = {
          type: 'ai-code-review',
          payload: {
            repository: 'codzee/eval-repo',
            prNumber: 42,
            diff: '@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;',
          },
        };

        const response = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: jobInput,
        });

        expect(response.statusCode).toBe(201);
        expect(response.headers['content-type']).toContain('application/json');

        const job = response.json();
        expect(job.id).toBeDefined();
        expect(typeof job.id).toBe('string');
        expect(job.type).toBe(jobInput.type);
        expect(job.payload).toEqual(jobInput.payload);
        expect(job.status).toBe('QUEUED');
        expect(job.attempts).toBe(0);
        expect(typeof job.createdAt).toBe('string');
        expect(typeof job.updatedAt).toBe('string');
      });

      it('should return 400 Bad Request when type is missing or empty', async () => {
        const missingTypeResponse = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            payload: { key: 'value' },
          },
        });
        expect(missingTypeResponse.statusCode).toBe(400);
        expect(missingTypeResponse.json().error).toBe('Bad Request');

        const emptyTypeResponse = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: '   ',
            payload: { key: 'value' },
          },
        });
        expect(emptyTypeResponse.statusCode).toBe(400);
        expect(emptyTypeResponse.json().error).toBe('Bad Request');
      });

      it('should return 400 Bad Request when payload is missing or invalid', async () => {
        const missingPayloadResponse = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: 'ai-review',
          },
        });
        expect(missingPayloadResponse.statusCode).toBe(400);

        const invalidPayloadResponse = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: 'ai-review',
            payload: 'not-an-object',
          },
        });
        expect(invalidPayloadResponse.statusCode).toBe(400);

        const arrayPayloadResponse = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: 'ai-review',
            payload: [1, 2, 3],
          },
        });
        expect(arrayPayloadResponse.statusCode).toBe(400);
      });

      it('should return 400 Bad Request when client attempts to provide server-managed fields', async () => {
        const responseWithInjectedFields = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: 'security-scan',
            payload: { branch: 'main' },
            status: 'COMPLETED',
            attempts: 10,
          },
        });

        expect(responseWithInjectedFields.statusCode).toBe(400);
        const error = responseWithInjectedFields.json();
        expect(error.error).toBe('Bad Request');
      });
    });

    describe('GET /jobs/:id', () => {
      it('should retrieve an existing job by ID with status 200', async () => {
        // Create job first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: 'lint-runner',
            payload: { ruleSet: 'recommended' },
          },
        });
        const createdJob = createResponse.json();

        // Retrieve job
        const getResponse = await app.inject({
          method: 'GET',
          url: `/jobs/${createdJob.id}`,
        });

        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.json()).toEqual(createdJob);
      });

      it('should return 404 Not Found for a nonexistent job ID', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/jobs/non-existent-job-id-9999',
        });

        expect(response.statusCode).toBe(404);
        const error = response.json();
        expect(error.error).toBe('Not Found');
        expect(error.message).toContain('non-existent-job-id-9999');
      });
    });

    describe('GET /jobs', () => {
      it('should list jobs with default pagination', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/jobs',
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(Array.isArray(data.items)).toBe(true);
        expect(typeof data.total).toBe('number');
        expect(data.limit).toBe(20);
        expect(data.offset).toBe(0);
      });

      it('should respect custom limit and offset query parameters', async () => {
        // Create an isolated app instance with a known set of jobs
        const isolatedApp = buildApp({ logger: false });
        await isolatedApp.ready();

        for (let i = 1; i <= 4; i++) {
          await isolatedApp.inject({
            method: 'POST',
            url: '/jobs',
            payload: {
              type: `test-job-${i}`,
              payload: { order: i },
            },
          });
        }

        const pageResponse = await isolatedApp.inject({
          method: 'GET',
          url: '/jobs',
          query: {
            limit: '2',
            offset: '1',
          },
        });

        expect(pageResponse.statusCode).toBe(200);
        const pageData = pageResponse.json();
        expect(pageData.total).toBe(4);
        expect(pageData.limit).toBe(2);
        expect(pageData.offset).toBe(1);
        expect(pageData.items.length).toBe(2);
        expect(pageData.items[0].type).toBe('test-job-2');
        expect(pageData.items[1].type).toBe('test-job-3');

        await isolatedApp.close();
      });

      it('should return 400 Bad Request for invalid pagination parameters', async () => {
        const negativeLimitResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '-5' },
        });
        expect(negativeLimitResponse.statusCode).toBe(400);

        const zeroLimitResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '0' },
        });
        expect(zeroLimitResponse.statusCode).toBe(400);

        const invalidTypeResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: 'invalid-string' },
        });
        expect(invalidTypeResponse.statusCode).toBe(400);

        const emptyStringResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '' },
        });
        expect(emptyStringResponse.statusCode).toBe(400);

        const whitespaceStringResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '   ' },
        });
        expect(whitespaceStringResponse.statusCode).toBe(400);

        const decimalLimitResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '10.5' },
        });
        expect(decimalLimitResponse.statusCode).toBe(400);

        const exceedsMaxLimitResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '101' },
        });
        expect(exceedsMaxLimitResponse.statusCode).toBe(400);

        const negativeOffsetResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { offset: '-1' },
        });
        expect(negativeOffsetResponse.statusCode).toBe(400);

        const decimalOffsetResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { offset: '3.14' },
        });
        expect(decimalOffsetResponse.statusCode).toBe(400);

        const invalidOffsetStringResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { offset: 'abc' },
        });
        expect(invalidOffsetStringResponse.statusCode).toBe(400);
      });

      it('should return 400 Bad Request for an excessively large offset exceeding safe integer range', async () => {
        const largeOffsetResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { offset: '99999999999999999999999999999999' },
        });
        expect(largeOffsetResponse.statusCode).toBe(400);
        expect(largeOffsetResponse.json().error).toBe('Bad Request');
      });

      it('should accept valid boundary values for limit and offset', async () => {
        // Min boundary: limit=1, offset=0
        const minBoundaryResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '1', offset: '0' },
        });
        expect(minBoundaryResponse.statusCode).toBe(200);
        const minData = minBoundaryResponse.json();
        expect(minData.limit).toBe(1);
        expect(minData.offset).toBe(0);

        // Max boundary: limit=100
        const maxBoundaryResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '100' },
        });
        expect(maxBoundaryResponse.statusCode).toBe(200);
        const maxData = maxBoundaryResponse.json();
        expect(maxData.limit).toBe(100);
        expect(maxData.offset).toBe(0); // default offset applied when omitted
      });

      it('should apply defaults when individual pagination parameters are omitted', async () => {
        // Only limit provided, offset omitted
        const limitOnlyResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { limit: '5' },
        });
        expect(limitOnlyResponse.statusCode).toBe(200);
        expect(limitOnlyResponse.json().limit).toBe(5);
        expect(limitOnlyResponse.json().offset).toBe(0);

        // Only offset provided, limit omitted
        const offsetOnlyResponse = await app.inject({
          method: 'GET',
          url: '/jobs',
          query: { offset: '2' },
        });
        expect(offsetOnlyResponse.statusCode).toBe(200);
        expect(offsetOnlyResponse.json().limit).toBe(20);
        expect(offsetOnlyResponse.json().offset).toBe(2);
      });
    });

    describe('Multi-Instance Storage Isolation', () => {
      it('should ensure separate app instances do not share job data', async () => {
        const instanceA = buildApp({ logger: false });
        const instanceB = buildApp({ logger: false });
        await instanceA.ready();
        await instanceB.ready();

        // Create job in instance A
        const createRes = await instanceA.inject({
          method: 'POST',
          url: '/jobs',
          payload: {
            type: 'isolated-task',
            payload: { origin: 'app-A' },
          },
        });
        expect(createRes.statusCode).toBe(201);
        const jobInA = createRes.json();

        // Job should exist in instance A
        const getInA = await instanceA.inject({
          method: 'GET',
          url: `/jobs/${jobInA.id}`,
        });
        expect(getInA.statusCode).toBe(200);

        // Job must NOT exist in instance B
        const getInB = await instanceB.inject({
          method: 'GET',
          url: `/jobs/${jobInA.id}`,
        });
        expect(getInB.statusCode).toBe(404);

        await instanceA.close();
        await instanceB.close();
      });
    });
  });

  describe('Review Endpoints (Preserved Baseline)', () => {
    describe('GET /api/reviews', () => {
      it('should return list of all reviews', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/reviews',
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(Array.isArray(data.reviews)).toBe(true);
        expect(data.total).toBeGreaterThanOrEqual(2);
      });

      it('should filter reviews by author query parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/reviews',
          query: {
            author: 'alice',
          },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json();
        expect(data.reviews.length).toBe(1);
        expect(data.reviews[0].author).toBe('alice');
      });
    });

    describe('GET /api/reviews/:id', () => {
      it('should return review details for a valid ID', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/reviews/rev-1',
        });

        expect(response.statusCode).toBe(200);
        const review = response.json();
        expect(review.id).toBe('rev-1');
        expect(review.title).toBe('Fix race condition in review worker');
        expect(review.status).toBe('APPROVED');
      });

      it('should return 404 for a non-existent review ID', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/reviews/rev-999999',
        });

        expect(response.statusCode).toBe(404);
        const error = response.json();
        expect(error.error).toBe('Not Found');
      });
    });

    describe('POST /api/reviews', () => {
      it('should create a review with valid payload', async () => {
        const newReviewPayload = {
          title: 'Optimize SQL indexing for audit log query',
          repository: 'codzee/database',
          prNumber: 305,
          author: 'charlie',
          status: 'PENDING',
          score: 92,
          comments: 'Index added on composite key (tenant_id, created_at).',
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/reviews',
          payload: newReviewPayload,
        });

        expect(response.statusCode).toBe(201);
        const created = response.json();
        expect(created.id).toBeDefined();
        expect(created.title).toBe(newReviewPayload.title);
        expect(created.repository).toBe(newReviewPayload.repository);
        expect(created.score).toBe(92);

        // Verify the new review can be fetched via GET
        const getResponse = await app.inject({
          method: 'GET',
          url: `/api/reviews/${created.id}`,
        });
        expect(getResponse.statusCode).toBe(200);
        expect(getResponse.json().author).toBe('charlie');
      });

      it('should return 400 Bad Request when payload fails validation', async () => {
        const invalidPayload = {
          title: '', // empty title not allowed
          prNumber: -10, // negative PR number
          score: 150, // exceeds max 100
        };

        const response = await app.inject({
          method: 'POST',
          url: '/api/reviews',
          payload: invalidPayload,
        });

        expect(response.statusCode).toBe(400);
        const error = response.json();
        expect(error.error).toBe('Bad Request');
        expect(error.details).toBeDefined();
      });
    });

    describe('DELETE /api/reviews/:id', () => {
      it('should delete an existing review and return 404 on subsequent get', async () => {
        // First create a review to delete
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/reviews',
          payload: {
            title: 'Temporary review to delete',
            repository: 'codzee/temp',
            prNumber: 99,
            author: 'tester',
            status: 'PENDING',
            score: 50,
          },
        });
        const createdId = createResponse.json().id;

        // Delete the review
        const deleteResponse = await app.inject({
          method: 'DELETE',
          url: `/api/reviews/${createdId}`,
        });
        expect(deleteResponse.statusCode).toBe(200);
        expect(deleteResponse.json().deletedId).toBe(createdId);

        // Verify it is gone
        const verifyResponse = await app.inject({
          method: 'GET',
          url: `/api/reviews/${createdId}`,
        });
        expect(verifyResponse.statusCode).toBe(404);
      });

      it('should return 404 when attempting to delete a non-existent review', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/api/reviews/rev-does-not-exist',
        });
        expect(response.statusCode).toBe(404);
      });
    });
  });
});
