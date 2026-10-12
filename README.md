# codzee-review-lab

A minimal TypeScript and Node.js backend evaluation testbed for evaluating the AI code review tool **Codzee**.

> **Note on Data Persistence:** Storage is entirely **in-memory** (`Map`-backed repositories). All job and review data is volatile and will be lost when the application process terminates or restarts.

---

## Technology Stack

- **Runtime:** Node.js (v20+ / v22+ LTS)
- **Language:** TypeScript with strict type checking and `NodeNext` module resolution
- **HTTP Framework:** Fastify v5 with built-in `inject()` API for in-memory testing
- **Schema Validation:** Zod v4 for strict runtime request validation
- **Testing:** Vitest

---

## Prerequisites

- **Node.js:** v20.0.0 or higher (v20.x or v22.x LTS recommended)
- **npm:** v10.0.0 or higher

---

## Getting Started

### 1. Installation

Install all project dependencies using clean install:

```bash
npm ci
```

### 2. Development

Start the development server with live reload powered by `tsx`:

```bash
npm run dev
```

The server listens on `http://0.0.0.0:3000` by default. You can configure the port and host via environment variables:
- `PORT`: Server port (default: `3000`)
- `HOST`: Server host binding (default: `0.0.0.0`)
- `LOG_LEVEL`: Log level (default: `info`)

### 3. Build & Production Startup

Compile TypeScript to JavaScript in `dist/`:

```bash
npm run build
```

Run the compiled production server:

```bash
npm start
```

### 4. Running Tests

Execute the full Vitest test suite (unit and Fastify injection tests):

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

---

## API Reference

### Error Response Format

When a request fails validation or a resource is missing, the API returns a structured JSON error payload:

```json
{
  "error": "Bad Request",
  "message": "Invalid job payload",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["type"],
      "message": "Required"
    }
  ]
}
```

Or for not-found errors:

```json
{
  "error": "Not Found",
  "message": "Job with ID 'non-existent-id' was not found."
}
```

---

### Endpoints

#### 1. Create a Job

Create and queue a new background evaluation job.

- **URL:** `/jobs`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`

##### Validation Rules:
- `type` *(required)*: Non-empty string. Whitespace-only strings are rejected.
- `payload` *(required)*: JSON object (`Record<string, unknown>`). Must be a non-null object; arrays and primitives are rejected.
- **Server-Managed Fields:** Clients **must not** supply `id`, `status`, `attempts`, `createdAt`, or `updatedAt`. Any extra fields trigger HTTP 400.

##### Example Request:
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ai-code-review",
    "payload": {
      "repository": "codzee/sample-repo",
      "prNumber": 42,
      "diff": "@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;"
    }
  }'
```

##### Responses:
- **`201 Created`**: Job successfully created.
  ```json
  {
    "id": "e4a2c5a0-97f2-4e4b-9e45-810a9ff35b54",
    "type": "ai-code-review",
    "payload": {
      "repository": "codzee/sample-repo",
      "prNumber": 42,
      "diff": "@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;"
    },
    "status": "QUEUED",
    "attempts": 0,
    "createdAt": "2026-10-12T10:00:00.000Z",
    "updatedAt": "2026-10-12T10:00:00.000Z"
  }
  ```
- **`400 Bad Request`**: Missing/invalid fields or attempted injection of server-managed properties.

---

#### 2. Get a Job by ID

Fetch details of an existing job by its unique identifier.

- **URL:** `/jobs/:id`
- **Method:** `GET`

##### Example Request:
```bash
curl http://localhost:3000/jobs/e4a2c5a0-97f2-4e4b-9e45-810a9ff35b54
```

##### Responses:
- **`200 OK`**:
  ```json
  {
    "id": "e4a2c5a0-97f2-4e4b-9e45-810a9ff35b54",
    "type": "ai-code-review",
    "payload": {
      "repository": "codzee/sample-repo",
      "prNumber": 42,
      "diff": "@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;"
    },
    "status": "QUEUED",
    "attempts": 0,
    "createdAt": "2026-10-12T10:00:00.000Z",
    "updatedAt": "2026-10-12T10:00:00.000Z"
  }
  ```
- **`404 Not Found`**:
  ```json
  {
    "error": "Not Found",
    "message": "Job with ID 'e4a2c5a0-97f2-4e4b-9e45-810a9ff35b54' was not found."
  }
  ```

---

#### 3. List Jobs (Paginated)

Retrieve a paginated list of queued or processed jobs.

- **URL:** `/jobs`
- **Method:** `GET`
- **Query Parameters:**
  - `limit` *(optional)*: Positive integer between `1` and `100`. Defaults to `20`.
  - `offset` *(optional)*: Non-negative safe integer `>= 0`. Defaults to `0`.

##### Validation Rules:
- `limit` must be an integer between `1` and `100`. Values `<= 0`, `> 100`, decimals, or non-numeric strings return HTTP 400.
- `offset` must be an integer `>= 0` within JavaScript's safe integer range (`<= Number.MAX_SAFE_INTEGER`). Negative values, decimals, non-numeric strings, or excessively large unsafe values return HTTP 400.
- When omitted, parameters remain `undefined` and repository defaults (`limit: 20`, `offset: 0`) apply.

##### Example Request:
```bash
curl "http://localhost:3000/jobs?limit=10&offset=0"
```

##### Responses:
- **`200 OK`**:
  ```json
  {
    "items": [
      {
        "id": "e4a2c5a0-97f2-4e4b-9e45-810a9ff35b54",
        "type": "ai-code-review",
        "payload": {
          "repository": "codzee/sample-repo",
          "prNumber": 42
        },
        "status": "QUEUED",
        "attempts": 0,
        "createdAt": "2026-10-12T10:00:00.000Z",
        "updatedAt": "2026-10-12T10:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
  ```
- **`400 Bad Request`**: Invalid pagination query parameter.
  ```json
  {
    "error": "Bad Request",
    "message": "Invalid pagination query parameters",
    "details": [
      {
        "code": "too_big",
        "maximum": 100,
        "type": "number",
        "inclusive": true,
        "message": "limit cannot exceed 100",
        "path": ["limit"]
      }
    ]
  }
  ```

---

#### 4. Health Check

Utility endpoint to check server availability and process uptime.

- **URL:** `/health`
- **Method:** `GET`
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "uptime": 12.345,
    "timestamp": "2026-10-12T10:00:00.000Z"
  }
  ```

---

## Continuous Integration

GitHub Actions workflow is located at [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It triggers on pushes and pull requests targeting the `master` branch, executing clean dependency installation (`npm ci`), TypeScript compilation (`npm run build`), and the automated test suite (`npm test`) across supported Node.js LTS versions (v20 and v22).
