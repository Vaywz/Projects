# HitexisTimeControl

Employee Time Tracking System - Web application for managing employee work hours, vacations, and attendance.

## Features

### Employee Features
- Personal dashboard with time entry management
- Calendar view with Latvian holidays
- Multiple time entries per day support
- Workplace selection (office/remote)
- Vacation and sick day management
- Personal statistics (week/month/year)
- View who's in the office

### Admin Features
- Employee dashboard with cards
- Employee management (CRUD)
- Company-wide statistics and charts
- Office presence overview
- Avatar upload for employees

### Business Logic
- Automatic email notifications for missing time entries (3 working days)
- Latvian calendar with official holidays
- Break time deduction from work hours
- No notifications during sick leave or vacation

## Tech Stack

- **Frontend**: React + TypeScript + Ant Design + Recharts
- **Backend**: Python + FastAPI + SQLAlchemy 2.0
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Background Tasks**: Celery
- **Authentication**: JWT

## Quick Start with Docker

1. Clone the repository:
```bash
git clone <repository-url>
cd HitexisTimeControl
```

2. Copy environment files:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Start all services:
```bash
docker-compose up -d
```

4. Create an admin user:
```bash
docker-compose exec backend python scripts/create_admin.py admin@example.com password123 Admin User
```

5. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/docs

## Development Setup

### Backend

1. Create a virtual environment:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Run migrations:
```bash
alembic upgrade head
```

5. Create admin user:
```bash
python scripts/create_admin.py admin@example.com password123 Admin User
```

6. Start the server:
```bash
uvicorn app.main:app --reload
```

### Frontend

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```

3. Start development server:
```bash
npm start
```

### Celery (Background Tasks)

1. Start worker:
```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

2. Start scheduler:
```bash
celery -A app.tasks.celery_app beat --loglevel=info
```

## API Documentation

Once the backend is running, access:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

## Project Structure

```
HitexisTimeControl/
├── backend/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── core/          # Config, database, security
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   └── tasks/         # Celery tasks
│   ├── alembic/           # Database migrations
│   ├── scripts/           # Utility scripts
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API service
│   │   ├── store/         # Zustand store
│   │   └── types/         # TypeScript types
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
DATABASE_URL_SYNC=postgresql://user:pass@host:5432/db
SECRET_KEY=your-secret-key
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=password
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:8000/api
```

## Latvian Holidays

The system includes all official Latvian holidays:
- New Year (January 1)
- Good Friday & Easter Monday (calculated)
- Labour Day (May 1)
- Independence Restoration Day (May 4)
- Midsummer Eve & Day (June 23-24)
- Proclamation Day (November 18)
- Christmas (December 24-26)
- New Year's Eve (December 31)

## License

MIT License
