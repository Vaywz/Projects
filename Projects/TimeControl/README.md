# HitexisTimeControl

Employee time tracking web application for work hours, vacations, attendance, office presence, change requests, and notifications.

## Stack

- Frontend: React, TypeScript, Ant Design
- Backend: FastAPI, SQLAlchemy, Alembic
- Database: PostgreSQL
- Queue/cache: Redis, Celery
- Auth: JWT
- Email: Microsoft Graph

## Quick Start

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Edit `.env` and set strong values for:

```bash
SECRET_KEY
POSTGRES_PASSWORD
FRONTEND_URL
BACKEND_CORS_ORIGINS
```

3. Start the development stack:

```bash
docker compose -f docker-compose-dev.yml up -d --build
```

4. Create an admin user:

```bash
docker compose -f docker-compose-dev.yml exec backend python scripts/create_admin.py admin@example.com "strong-password" "Admin User"
```

5. Open the app:

- Frontend: http://localhost:3000
- Backend docs: http://localhost:8000/api/docs

## Production

Use `docker-compose.prod.yml` with a real `.env`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Production compose intentionally exposes only the frontend and backend ports. PostgreSQL and Redis stay inside the Docker network.

## Environment

Important variables:

```bash
SECRET_KEY=generate-a-strong-secret-with-at-least-32-characters
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-this-database-password
POSTGRES_DB=hitexis_time
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
FRONTEND_URL=https://your-domain.example
BACKEND_CORS_ORIGINS=https://your-domain.example
REACT_APP_API_URL=/api
```

Microsoft Graph email notifications are optional. To enable them, configure:

```bash
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_FROM_EMAIL=
MS_FROM_NAME=HitexisTimeControl
```

## Local Development

Backend:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm start
```

## Notes

- Do not commit `.env`, uploads, build output, `node_modules`, or Python cache files.
- `SECRET_KEY` must be stable in production, otherwise existing JWT sessions become invalid after restart.
- `BACKEND_CORS_ORIGINS` is comma-separated. Keep it limited to trusted frontend origins.
