#!/usr/bin/env python
"""Script to create an admin user."""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.services.user_service import UserService
from app.schemas.user import UserCreate
from app.models.user import UserRole


async def create_admin(email: str, password: str, first_name: str, last_name: str):
    """Create an admin user."""
    async with AsyncSessionLocal() as session:
        user_service = UserService(session)

        # Check if user exists
        existing = await user_service.get_by_email(email)
        if existing:
            print(f"User with email {email} already exists!")
            return

        # Create admin user
        user_data = UserCreate(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=UserRole.ADMIN,
        )

        user = await user_service.create(user_data)
        await session.commit()

        print(f"Admin user created successfully!")
        print(f"  Email: {email}")
        print(f"  Name: {first_name} {last_name}")
        print(f"  Role: admin")


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python create_admin.py <email> <password> <first_name> <last_name>")
        print("Example: python create_admin.py admin@hitexis.com password123 Admin User")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]
    first_name = sys.argv[3]
    last_name = sys.argv[4]

    asyncio.run(create_admin(email, password, first_name, last_name))
