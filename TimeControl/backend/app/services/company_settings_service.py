from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_setting import CompanySetting
from app.schemas.company_setting import CompanySettingsResponse, ALLOWED_ICONS


class CompanySettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_settings(self) -> CompanySettingsResponse:
        """Get all company settings as a structured response."""
        result = await self.db.execute(select(CompanySetting))
        settings = result.scalars().all()

        settings_dict = {s.key: s.value for s in settings}

        return CompanySettingsResponse(
            logo_url=settings_dict.get('logo_url'),
            icon_vacation=settings_dict.get('icon_vacation', 'Palmtree'),
            icon_sick=settings_dict.get('icon_sick', 'Cross'),
            icon_office=settings_dict.get('icon_office', 'Building2'),
            icon_remote=settings_dict.get('icon_remote', 'Monitor'),
            icon_holiday=settings_dict.get('icon_holiday', 'Gift'),
            icon_excused=settings_dict.get('icon_excused', 'CircleCheckBig'),
        )

    async def get_setting(self, key: str) -> Optional[CompanySetting]:
        """Get a single setting by key."""
        result = await self.db.execute(
            select(CompanySetting).where(CompanySetting.key == key)
        )
        return result.scalar_one_or_none()

    async def get_all_raw(self) -> List[CompanySetting]:
        """Get all settings as raw database records."""
        result = await self.db.execute(select(CompanySetting))
        return list(result.scalars().all())

    async def update_setting(self, key: str, value: Optional[str]) -> CompanySetting:
        """Update or create a setting."""
        setting = await self.get_setting(key)

        if setting:
            setting.value = value
        else:
            setting = CompanySetting(key=key, value=value)
            self.db.add(setting)

        await self.db.flush()
        await self.db.refresh(setting)
        return setting

    async def update_logo(self, logo_url: str) -> CompanySetting:
        """Update the company logo URL."""
        return await self.update_setting('logo_url', logo_url)

    async def update_icon(self, icon_type: str, icon_name: str) -> CompanySetting:
        """Update an icon setting."""
        # Allow custom uploaded icons (paths starting with /uploads/) or Lucide icons
        is_custom_icon = icon_name.startswith('/uploads/') or icon_name.startswith('data:')
        if not is_custom_icon and icon_name not in ALLOWED_ICONS:
            raise ValueError(f"Icon '{icon_name}' is not in the allowed icons list")

        valid_keys = ['icon_vacation', 'icon_sick', 'icon_office',
                      'icon_remote', 'icon_holiday', 'icon_excused']
        if icon_type not in valid_keys:
            raise ValueError(f"Invalid icon type: {icon_type}")

        return await self.update_setting(icon_type, icon_name)

    async def delete_logo(self) -> bool:
        """Delete the company logo (set to null)."""
        await self.update_setting('logo_url', None)
        return True
