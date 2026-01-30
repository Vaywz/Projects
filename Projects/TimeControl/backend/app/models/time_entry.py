import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, Time, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base


class WorkplaceType(str, enum.Enum):
    OFFICE = "office"
    REMOTE = "remote"


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    break_minutes = Column(Integer, default=0, nullable=False)
    workplace = Column(Enum(WorkplaceType, values_callable=lambda x: [e.value for e in x]), default=WorkplaceType.OFFICE, nullable=False)
    comment = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="time_entries")

    @property
    def duration_minutes(self) -> int:
        """Calculate duration in minutes (excluding break)."""
        start_minutes = self.start_time.hour * 60 + self.start_time.minute
        end_minutes = self.end_time.hour * 60 + self.end_time.minute
        return max(0, end_minutes - start_minutes - self.break_minutes)

    @property
    def duration_hours(self) -> float:
        """Calculate duration in hours (excluding break)."""
        return self.duration_minutes / 60

    def __repr__(self):
        return f"<TimeEntry(id={self.id}, date={self.date}, {self.start_time}-{self.end_time})>"
