import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Boolean, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class NotificationType(str, enum.Enum):
    BIRTHDAY = "birthday"
    NAME_DAY = "name_day"
    CHANGE_REQUEST = "change_request"
    WEEKLY_REMINDER = "weekly_reminder"
    MISSING_ENTRY = "missing_entry"
    SYSTEM = "system"


class Notification(Base):
    """Model for storing user notifications."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum(NotificationType, values_callable=lambda x: [e.value for e in x]), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    related_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # For birthday/name_day notifications
    related_request_id = Column(Integer, nullable=True)  # For change request notifications
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], back_populates="notifications")
    related_user = relationship("User", foreign_keys=[related_user_id])

    def __repr__(self):
        return f"<Notification(id={self.id}, type={self.type}, user_id={self.user_id})>"


class NotificationSettings(Base):
    """Model for storing user notification preferences."""
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Email notifications
    email_birthday = Column(Boolean, default=True)
    email_name_day = Column(Boolean, default=True)
    email_change_request = Column(Boolean, default=True)
    email_weekly_reminder = Column(Boolean, default=False)  # Off by default for admins

    # In-app notifications
    app_birthday = Column(Boolean, default=True)
    app_name_day = Column(Boolean, default=True)
    app_change_request = Column(Boolean, default=True)
    app_weekly_reminder = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="notification_settings")

    def __repr__(self):
        return f"<NotificationSettings(user_id={self.user_id})>"