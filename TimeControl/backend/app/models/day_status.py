import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base


class StatusType(str, enum.Enum):
    NORMAL = "normal"
    SICK = "sick"
    VACATION = "vacation"
    EXCUSED = "excused"  # Оправданный пропуск


class DayStatus(Base):
    __tablename__ = "day_statuses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    status = Column(Enum(StatusType, values_callable=lambda x: [e.value for e in x]), default=StatusType.NORMAL, nullable=False)
    auto_skip_day = Column(Boolean, default=False, nullable=False)
    note = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="day_statuses")

    def __repr__(self):
        return f"<DayStatus(id={self.id}, date={self.date}, status={self.status})>"
