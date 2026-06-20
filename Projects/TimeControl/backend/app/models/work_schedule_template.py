from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


class WorkScheduleTemplate(Base):
    """Reusable weekly work-schedule template owned by a user.

    schedule JSON shape:
        {
          "mon": {"enabled": true, "start": "09:00", "end": "18:00", "break": 0, "workplace": "office"},
          "tue": {...}, "wed": {...}, "thu": {...}, "fri": {...},
          "sat": {"enabled": false, ...}, "sun": {"enabled": false, ...}
        }
    """
    __tablename__ = "work_schedule_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    schedule = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User")

    def __repr__(self):
        return f"<WorkScheduleTemplate(id={self.id}, name={self.name})>"