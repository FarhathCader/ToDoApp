# Demo Script (10–15 minutes)

1) **Architecture overview**: Show the diagram from README and describe services, datastores, and comms (HTTP + RabbitMQ).  
2) **Run locally**: `docker compose up --build`. Open http://localhost:8081.  
3) **Register/Login**: Create user or use seeded `alice@example.com / password123`.  
4) **Core features**: Create a task, mark complete → show a notification appears.  
5) **Scalability**: Show multiple replicas in Docker/K8s and `/metrics` endpoints.  
6) **Security**: Show JWT, rate limits, and blocked CORS origin.  
7) **Resilience**: Restart Notification Service → events continue to be consumed.  
8) **Extensibility**: Add a new service (e.g., email) by binding to `task.events` without changing producers.

**Recording target:** under 20 minutes.
