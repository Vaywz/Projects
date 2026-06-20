from datetime import datetime, date
from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
from .time_entry import WorkplaceType


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    bank_account = Column(String(50), nullable=True)
    position = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)  # Department/specialty (SEO, Frontend, Backend, etc.)
    default_workplace = Column(Enum(WorkplaceType, values_callable=lambda x: [e.value for e in x]), default=WorkplaceType.OFFICE, nullable=True)
    work_email = Column(String(255), nullable=True)
    employment_type = Column(String(50), default='full_time', nullable=True)
    payment_type = Column(String(50), default='salary', nullable=True)
    birthday = Column(Date, nullable=True)
    name_day = Column(Date, nullable=True)  # Name day (for notifications)
    contract_number = Column(String(50), nullable=True)  # Employment contract number
    employment_start_date = Column(Date, nullable=True)  # Start date of employment
    employment_end_date = Column(Date, nullable=True)  # First date when employment is inactive
    employment_end_reason = Column(String(500), nullable=True)  # Reason for employment termination
    emergency_contact_name = Column(String(200), nullable=True)  # Emergency contact name
    emergency_contact_phone = Column(String(50), nullable=True)  # Emergency contact phone
    declared_address = Column(String(500), nullable=True)  # Registered/declared address
    actual_address = Column(String(500), nullable=True)  # Actual/residential address
    personal_code = Column(String(20), nullable=True)  # Personal identification code (personas kods)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="profile")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def __repr__(self):
        return f"<EmployeeProfile(id={self.id}, name={self.full_name})>"
