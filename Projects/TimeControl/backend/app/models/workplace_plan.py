from datetime import datetime
from sqlalchemy import Column, Integer, Date, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
from .time_entry import WorkplaceType


class WorkplacePlan(Base):
    """Model for employees to plan their workplace (office/remote) in advance."""
    __tablename__ = "workplace_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    workplace = Column(Enum(WorkplaceType, name='workplacetype', create_type=False, values_callable=lambda x: [e.value for e in x]), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="workplace_plans")

    def __repr__(self):
        return f"<WorkplacePlan(id={self.id}, date={self.date}, workplace={self.workplace})>"