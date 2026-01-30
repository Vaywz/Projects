import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base


class VacationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Vacation(Base):
    __tablename__ = "vacations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    status = Column(Enum(VacationStatus, values_callable=lambda x: [e.value for e in x]), default=VacationStatus.APPROVED, nullable=False)
    note = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="vacations")

    @property
    def days_count(self) -> int:
        """Calculate total vacation days."""
        return (self.date_to - self.date_from).days + 1

    def __repr__(self):
        return f"<Vacation(id={self.id}, from={self.date_from}, to={self.date_to})>"
