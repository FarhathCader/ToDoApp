# TodoWithMicroservice – Cloud-native To‑Do App

A microservices-based To‑Do application demonstrating scalability, high availability, security, and modern DevOps deployment. It includes:
- API Gateway (Express + reverse proxy, rate limiter, JWT)
- User Service (auth & users; MongoDB)
- Task Service (CRUD tasks; RabbitMQ events; Redis caching; PostgreSQL)
- Notification Service (consumes task events; MongoDB)
- Frontend (static HTML/JS)
- Docker Compose for local dev
- Kubernetes manifests (HPA, liveness/readiness, Ingress-ready)
- GitHub Actions CI (build & push images)

## Quick start (Docker Compose)


copy .env in the root folder
run the command 
```bash
docker-compose up -d --build
```

- Frontend: http://localhost:8081
- API Gateway: http://localhost:8080 (healthz at `/healthz`, metrics at `/metrics`)


## Services & ports
- api-gateway: :8080
- user-service: :3001
- task-service: :3002
- notification-service: :3003
- mongo: :27017
- redis: :6379
- rabbitmq mgmt: :15672 (guest/guest)

## Security & Observability
- JWT auth (HS256), bcrypt password hashing
- Strict input validation (Joi), Helmet, CORS, rate limiting
- Least-priv DB users in K8s (templates)
- `/metrics` Prometheus endpoint on every service

## Repository structure
```
api-gateway/
user-service/
task-service/
notification-service/
frontend/
k8s/
docs/
.github/workflows/
docker-compose.yml
.env.example
```
