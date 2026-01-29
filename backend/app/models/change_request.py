import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, Time, Text, Enum, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.core.database import Base


class ChangeRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ChangeRequestType(str, enum.Enum):
    # Time entry requests
    ADD = "add"       # Request to add a new entry
    EDIT = "edit"     # Request to edit an existing entry
    DELETE = "delete" # Request to delete an existing entry
    # Vacation requests
    ADD_VACATION = "add_vacation"
    EDIT_VACATION = "edit_vacation"
    DELETE_VACATION = "delete_vacation"
    # Sick day requests
    ADD_SICK_DAY = "add_sick_day"
    EDIT_SICK_DAY = "edit_sick_day"
    DELETE_SICK_DAY = "delete_sick_day"


class ChangeRequest(Base):
    __tablename__ = "change_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Request type
    request_type = Column(Enum(ChangeRequestType, values_callable=lambda x: [e.value for e in x]), nullable=False)

    # Reference to existing entry (for edit/delete)
    time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=True)
    vacation_id = Column(Integer, ForeignKey("vacations.id"), nullable=True)
    day_status_id = Column(Integer, ForeignKey("day_statuses.id"), nullable=True)

    # Requested changes
    date = Column(Date, nullable=False)
    date_to = Column(Date, nullable=True)  # End date for vacation/sick day ranges
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    break_minutes = Column(Integer, nullable=True)
    workplace = Column(String(20), nullable=True)  # 'office' or 'remote'
    comment = Column(Text, nullable=True)

    # Request reason/note
    reason = Column(Text, nullable=False)

    # Status
    status = Column(Enum(ChangeRequestStatus, values_callable=lambda x: [e.value for e in x]), default=ChangeRequestStatus.PENDING)

    # Admin response
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_comment = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="change_requests")
    admin = relationship("User", foreign_keys=[admin_id])
    time_entry = relationship("TimeEntry", backref="change_requests")
    vacation = relationship("Vacation", backref="change_requests")
    day_status = relationship("DayStatus", backref="change_requests")