from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# Predefined list of allowed Lucide icons
ALLOWED_ICONS = [
    "Palmtree", "Cross", "Building2", "Monitor", "Gift", "CircleCheckBig",
    "Home", "Briefcase", "Coffee", "Sun", "Moon", "Star", "Heart",
    "Smile", "Frown", "ThumbsUp", "ThumbsDown", "Check", "X",
    "Calendar", "Clock", "User", "Users", "MapPin", "Plane",
    "Car", "Bike", "Train", "Ship", "Umbrella", "Cloud", "CloudRain",
    "Thermometer", "Activity", "AlertCircle", "Bell", "Bookmark",
    "Camera", "CreditCard", "File", "Folder", "Globe", "Key",
    "Lock", "Mail", "MessageCircle", "Phone", "Search", "Settings",
    "Shield", "ShoppingCart", "Tag", "Trash", "Upload", "Download",
    "Wifi", "Zap", "Award", "Flag", "Target", "Compass",
    "Bed", "TreePine", "Mountain", "Waves", "Snowflake", "Flame",
    "PartyPopper", "Cake", "Baby", "GraduationCap", "Stethoscope",
    "Pill", "Syringe", "Bandage", "Hospital", "HeartPulse",
]


class CompanySettingBase(BaseModel):
    key: str
    value: Optional[str] = None


class CompanySettingCreate(CompanySettingBase):
    pass


class CompanySettingUpdate(BaseModel):
    value: Optional[str] = None


class CompanySettingResponse(BaseModel):
    id: int
    key: str
    value: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CompanySettingsResponse(BaseModel):
    """All company settings as a dictionary."""
    logo_url: Optional[str] = None
    icon_vacation: str = "Palmtree"
    icon_sick: str = "Cross"
    icon_office: str = "Building2"
    icon_remote: str = "Monitor"
    icon_holiday: str = "Gift"
    icon_excused: str = "CircleCheckBig"


class IconSettingsUpdate(BaseModel):
    """Update icon settings."""
    icon_vacation: Optional[str] = Field(None, description="Lucide icon name for vacation")
    icon_sick: Optional[str] = Field(None, description="Lucide icon name for sick day")
    icon_office: Optional[str] = Field(None, description="Lucide icon name for office")
    icon_remote: Optional[str] = Field(None, description="Lucide icon name for remote work")
    icon_holiday: Optional[str] = Field(None, description="Lucide icon name for holiday")
    icon_excused: Optional[str] = Field(None, description="Lucide icon name for excused absence")


class AllowedIconsResponse(BaseModel):
    """List of allowed icon names."""
    icons: List[str]
