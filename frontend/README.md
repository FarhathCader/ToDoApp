# React Frontend for TodoWithMicroservice

This replaces the static HTML UI with a React (Vite) app.

## Local dev (without Docker)
```bash
npm install
npm run dev
# open http://localhost:5173
```
The backend gateway must be at http://localhost:8080. Edit API base in the components if you change it.

## Docker (used by docker-compose)
The provided Dockerfile builds the React app and serves it via Nginx on port 80.

In the project root (where docker-compose.yml lives):
```bash
docker compose up --build frontend
# or build the whole stack:
docker compose up --build
```
Then open http://localhost:8081
