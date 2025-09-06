# Building a scalable, secured, and highly available cloud application

## Introduction
We built a **TodoWithMicroservice** application that models a simple multi-user to‑do system. The project demonstrates cloud-native design principles including **microservices**, **API gateway**, **stateless services**, **observability**, and **automated deployment**.

## Architecture
**Services:** API Gateway, User Service (auth), Task Service (CRUD & events), Notification Service (event consumer).  
**Datastores:** MongoDB for persistence, Redis for caching hot reads, RabbitMQ for asynchronous communication.  
**Sync communication:** REST over HTTP via the gateway.  
**Async communication:** Domain events (e.g., `task.completed`) on RabbitMQ topic exchange `task.events`.  
**Security:** JWT (HS256), bcrypt password hashing, validation with Joi, rate limiting and Helmet at the edge, CORS allowlist, least-privileged secrets (K8s Secret).  
**Scalability & availability:** Horizontal replicas for stateless services; HPA on CPU; readiness & liveness probes; externalized state in Mongo/Redis/RabbitMQ.  
**Observability:** `/metrics` Prometheus endpoint and structured logs.

## Implementation steps
1. Initialize each service with Express + Dockerfile; define contracts (`/users/*`, `/tasks/*`, `/notifications/*`).  
2. Implement JWT-based auth (User Service issues tokens; Gateway verifies for protected routes).  
3. Implement Task Service CRUD + Redis caching for `/tasks` list and publish `task.completed` events.  
4. Implement Notification Service that subscribes to `task.events` and stores human-readable notifications.  
5. API Gateway reverse-proxies to services, applies security middlewares, and exposes `/metrics` and `/healthz`.  
6. Docker Compose wiring for local dev; seed script for demo users.  
7. K8s manifests with replicas, probes, resource requests/limits, and an HPA for Task Service.  
8. CI builds and pushes images to GHCR on each push to `main`.

## Challenges
- **Service boundaries:** keeping auth logic centralized while exposing clear contracts.  
- **Event ordering & retries:** consumers must be idempotent; we ack/nack msgs carefully.  
- **Caching invalidation:** invalidating on writes to avoid stale reads.  
- **Local vs K8s configs:** different hostnames and secrets management.

## Lessons learned
- Small, **well-bounded services** simplify scaling and independent deployment.  
- **Async events** decouple features (e.g., notifications) so new services can be added without touching existing APIs.  
- **Defense in depth** (gateway protections + validation + least-privilege) reduces risk.  
- **Automation** (CI + container images) enables reproducible deployments.

