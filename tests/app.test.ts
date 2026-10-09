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
