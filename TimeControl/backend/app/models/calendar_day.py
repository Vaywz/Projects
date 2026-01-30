import enum
from sqlalchemy import Column, Integer, String, Date, Boolean, Enum
from app.core.database import Base


class DayType(str, enum.Enum):
    WORKDAY = "workday"
    WEEKEND = "weekend"
    HOLIDAY = "holiday"


class CalendarDay(Base):
    __tablename__ = "calendar_days"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, index=True, nullable=False)
    day_type = Column(Enum(DayType, values_callable=lambda x: [e.value for e in x]), default=DayType.WORKDAY, nullable=False)
    holiday_name = Column(String(255), nullable=True)
    holiday_name_lv = Column(String(255), nullable=True)
    holiday_name_en = Column(String(255), nullable=True)
    country = Column(String(10), default="LV", nullable=False)
    is_working_day = Column(Boolean, default=True, nullable=False)

    def __repr__(self):
        return f"<CalendarDay(date={self.date}, type={self.day_type})>"
