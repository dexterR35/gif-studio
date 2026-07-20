# ASYNC TASKS

**Authority:** CURSOR plan Phases 9–10 · [ADR 0010](../adr/0010-ai-local-backend-routing.md)

## Frontend

| Module | Role |
|--------|------|
| `src/tasks/task-manager.js` | Submit / cancel / progress / stale revision checks |
| `src/tasks/task-revision.js` | Project revision tokens for result rejection |
| `src/tasks/routing-policy.js` | Local-backend-first for Best + export |
| `src/tasks/model-registry.js` | Shape `/api/health` into engine capabilities |
| `src/api/js-client.js` | OpenAPI-aligned fetch helpers |
| `src/api/ai-fetch.js` | AI request helpers |

Flags: `taskManagerV2`, `serverJobsV2` (opt-in until UI fully migrated).

## Backend jobs

| Module | Role |
|--------|------|
| `src/gif_studio/api/jobs_router.py` | `POST/GET /api/v1/jobs` |
| `src/gif_studio/api/job_store.py` | In-process job records |
| `src/gif_studio/api/schemas.py` | Pydantic job payloads |
| `src/gif_studio/web_api.py` | Mounts + legacy `/api/ai/*`, `/api/export` |

Tests: `tests/js/task-manager.test.js`, `tests/test_api_v1_jobs.py`, `tests/js/openapi-client.test.js`.
