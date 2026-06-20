import logging
from html import escape
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


REQUEST_TYPE_LABELS = {
    "add": "Jauns darba laika ieraksts",
    "edit": "Darba laika ieraksta labošana",
    "delete": "Darba laika ieraksta dzēšana",
    "add_vacation": "Atvaļinājuma pievienošana",
    "edit_vacation": "Atvaļinājuma labošana",
    "delete_vacation": "Atvaļinājuma dzēšana",
    "add_sick_day": "Slimības dienas pievienošana",
    "edit_sick_day": "Slimības dienas labošana",
    "delete_sick_day": "Slimības dienas dzēšana",
}

WORKPLACE_LABELS = {
    "office": "Birojs",
    "remote": "Attālināti",
}

STATUS_LABELS = {
    "approved": "apstiprināts",
    "rejected": "noraidīts",
}


class EmailService:
    def __init__(self):
        self.tenant_id = settings.MS_TENANT_ID
        self.client_id = settings.MS_CLIENT_ID
        self.client_secret = settings.MS_CLIENT_SECRET
        self.from_email = settings.MS_FROM_EMAIL
        self.from_name = settings.MS_FROM_NAME

    def is_configured(self) -> bool:
        return all([
            self.tenant_id,
            self.client_id,
            self.client_secret,
            self.from_email,
        ])

    async def _get_access_token(self) -> str:
        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            payload = response.json()

        access_token = payload.get("access_token")
        if not access_token:
            raise ValueError("Microsoft Graph token response did not include access_token")
        return access_token

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """Send an email via Microsoft Graph."""
        if not self.is_configured():
            logger.warning("Microsoft Graph credentials not configured, skipping email send")
            return False

        try:
            access_token = await self._get_access_token()
            send_mail_url = f"https://graph.microsoft.com/v1.0/users/{self.from_email}/sendMail"
            body_content = html_content or text_content or ""
            body_type = "HTML" if html_content else "Text"

            payload = {
                "message": {
                    "subject": subject,
                    "body": {
                        "contentType": body_type,
                        "content": body_content,
                    },
                    "toRecipients": [
                        {
                            "emailAddress": {
                                "address": to_email,
                            }
                        }
                    ],
                },
                "saveToSentItems": True,
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    send_mail_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()

            logger.info("Email sent successfully to %s", to_email)
            return True
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", to_email, exc)
            return False

    def _wrap_html_email(self, title: str, body_html: str, accent_color: str = "#279CF1") -> str:
        return f"""<!DOCTYPE html>
<html lang="lv">
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #3B3E41; background-color: #f5f7fa; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: {accent_color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ padding: 24px; background-color: #FFFFFF; border: 1px solid #E5E7EB; }}
        .info-table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
        .info-table td {{ padding: 10px 12px; border: 1px solid #E5E7EB; vertical-align: top; }}
        .info-table td.label {{ width: 180px; font-weight: bold; color: #436597; background-color: #F8FAFC; }}
        .button {{ display: inline-block; background-color: {accent_color}; color: #FFFFFF; padding: 12px 24px;
                   text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: bold; }}
        .footer {{ text-align: center; padding: 18px; color: #436597; font-size: 12px; border-radius: 0 0 8px 8px;
                   background-color: #F8FAFC; border: 1px solid #E5E7EB; border-top: 0; }}
        p {{ margin: 0 0 14px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{escape(title)}</h1>
        </div>
        <div class="content">
            {body_html}
        </div>
        <div class="footer">
            <p>Ar cieņu,<br>{escape(self.from_name or "Hitexis komanda")}</p>
        </div>
    </div>
</body>
</html>"""

    @staticmethod
    def _format_request_type(request_type: str) -> str:
        return REQUEST_TYPE_LABELS.get(request_type, request_type)

    @staticmethod
    def _format_workplace(workplace: Optional[str]) -> str:
        if not workplace:
            return "Nav norādīts"
        return WORKPLACE_LABELS.get(workplace, workplace)

    @staticmethod
    def _format_resolution_status(status: str) -> str:
        return STATUS_LABELS.get(status, status)

    @staticmethod
    def _format_optional(value: Optional[str]) -> str:
        return value if value else "Nav norādīts"

    async def send_missing_entries_notification(
        self,
        to_email: str,
        employee_name: str,
        missing_dates: list,
    ) -> bool:
        """Send notification about missing time entries in Latvian."""
        subject = "Hitexis: Lūdzu, ievadiet darba stundas"

        dates_list = "\n".join([f"- {d.strftime('%d.%m.%Y')}" for d in missing_dates])
        dates_list_html = "".join([f"<li>{escape(d.strftime('%d.%m.%Y'))}</li>" for d in missing_dates])

        text_content = f"""Labdien, {employee_name}!

Mēs pamanījām, ka pēdējās darba dienās jūs neesat ievadījis informāciju par darba laiku:

{dates_list}

Lūdzu, atveriet sistēmu un aizpildiet datus:
{settings.FRONTEND_URL}

Ar cieņu,
{self.from_name or 'Hitexis komanda'}
"""

        html_content = self._wrap_html_email(
            "Hitexis",
            f"""
            <p>Labdien, <strong>{escape(employee_name)}</strong>!</p>
            <p>Mēs pamanījām, ka pēdējās darba dienās jūs neesat ievadījis informāciju par darba laiku:</p>
            <ul>{dates_list_html}</ul>
            <p>Lūdzu, atveriet sistēmu un aizpildiet datus.</p>
            <a href="{escape(settings.FRONTEND_URL)}" class="button">Atvērt Hitexis</a>
            """,
        )

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_weekly_planning_reminder(
        self,
        to_email: str,
        employee_name: str,
        week_start: str,
        week_end: str,
    ) -> bool:
        """Send weekly reminder to plan office/remote days in Latvian."""
        subject = "Hitexis: Lūdzu, saplānojiet darba vietu šai nedēļai"

        text_content = f"""Labdien, {employee_name}!

Jaunā darba nedēļa ir sākusies ({week_start} - {week_end}).

Lūdzu, ieejiet sistēmā un norādiet, kurās dienās plānojat strādāt no biroja un kurās - attālināti:
{settings.FRONTEND_URL}/office

Tas palīdzēs kolēģiem plānot tikšanās un sadarbību.

Ar cieņu,
{self.from_name or 'Hitexis komanda'}
"""

        html_content = self._wrap_html_email(
            "Hitexis",
            f"""
            <p>Labdien, <strong>{escape(employee_name)}</strong>!</p>
            <p>Jaunā darba nedēļa ir sākusies.</p>
            <table class="info-table">
                <tr>
                    <td class="label">Nedēļa</td>
                    <td>{escape(week_start)} - {escape(week_end)}</td>
                </tr>
            </table>
            <p>Lūdzu, ieejiet sistēmā un norādiet, kurās dienās plānojat strādāt no biroja un kurās - attālināti.</p>
            <p>Tas palīdzēs kolēģiem plānot tikšanās un sadarbību.</p>
            <a href="{escape(settings.FRONTEND_URL)}/office" class="button">Plānot darba vietu</a>
            """,
        )

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_change_request_notification(
        self,
        to_email: str,
        admin_name: str,
        employee_name: str,
        request_type: str,
        request_date: str,
        reason: str,
    ) -> bool:
        """Send notification about new change request to admin."""
        request_type_label = self._format_request_type(request_type)
        subject = f"Hitexis: Jauns izmaiņu pieprasījums no {employee_name}"

        text_content = f"""Labdien, {admin_name}!

{employee_name} ir iesniedzis jaunu izmaiņu pieprasījumu.

Pieprasījuma veids: {request_type_label}
Datums: {request_date}
Iemesls: {reason or 'Nav norādīts'}

Lūdzu, pārskatiet pieprasījumu sistēmā:
{settings.FRONTEND_URL}/admin/change-requests

Ar cieņu,
{self.from_name or 'Hitexis komanda'}
"""

        html_content = self._wrap_html_email(
            "Jauns izmaiņu pieprasījums",
            f"""
            <p>Labdien, <strong>{escape(admin_name)}</strong>!</p>
            <p><strong>{escape(employee_name)}</strong> ir iesniedzis jaunu izmaiņu pieprasījumu.</p>
            <table class="info-table">
                <tr>
                    <td class="label">Pieprasījuma veids</td>
                    <td>{escape(request_type_label)}</td>
                </tr>
                <tr>
                    <td class="label">Datums</td>
                    <td>{escape(request_date)}</td>
                </tr>
                <tr>
                    <td class="label">Iemesls</td>
                    <td>{escape(reason or 'Nav norādīts')}</td>
                </tr>
            </table>
            <a href="{escape(settings.FRONTEND_URL)}/admin/change-requests" class="button">Pārskatīt pieprasījumu</a>
            """,
            accent_color="#fa8c16",
        )

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_change_request_resolution_notification(
        self,
        to_email: str,
        employee_name: str,
        status: str,
        request_type: str,
        request_date: str,
        request_date_to: Optional[str],
        start_time: Optional[str],
        end_time: Optional[str],
        break_minutes: Optional[int],
        workplace: Optional[str],
        comment: Optional[str],
        reason: str,
        admin_comment: Optional[str],
    ) -> bool:
        """Send a resolution email to the employee after admin reviews a change request."""
        status_label = self._format_resolution_status(status)
        request_type_label = self._format_request_type(request_type)
        workplace_label = self._format_workplace(workplace)
        date_range = request_date if not request_date_to or request_date_to == request_date else f"{request_date} - {request_date_to}"
        time_range = "Nav norādīts"
        if start_time and end_time:
            time_range = f"{start_time} - {end_time}"
        break_label = f"{break_minutes} min" if break_minutes is not None else "Nav norādīts"

        subject = f"Hitexis: Jūsu izmaiņu pieprasījums ir {status_label}"

        text_content = f"""Labdien, {employee_name}!

Jūsu izmaiņu pieprasījums ir {status_label}.

Pieprasījuma veids: {request_type_label}
Datums: {date_range}
Laiks: {time_range}
Pārtraukums: {break_label}
Darba vieta: {workplace_label}
Iemesls: {reason}
Komentārs: {self._format_optional(comment)}
Admin komentārs: {self._format_optional(admin_comment)}

Lūdzu, pārbaudiet aktuālo informāciju sistēmā:
{settings.FRONTEND_URL}/change-requests

Ar cieņu,
{self.from_name or 'Hitexis komanda'}
"""

        html_content = self._wrap_html_email(
            "Izmaiņu pieprasījuma statuss",
            f"""
            <p>Labdien, <strong>{escape(employee_name)}</strong>!</p>
            <p>Jūsu izmaiņu pieprasījums ir <strong>{escape(status_label)}</strong>.</p>
            <table class="info-table">
                <tr>
                    <td class="label">Pieprasījuma veids</td>
                    <td>{escape(request_type_label)}</td>
                </tr>
                <tr>
                    <td class="label">Datums</td>
                    <td>{escape(date_range)}</td>
                </tr>
                <tr>
                    <td class="label">Laiks</td>
                    <td>{escape(time_range)}</td>
                </tr>
                <tr>
                    <td class="label">Pārtraukums</td>
                    <td>{escape(break_label)}</td>
                </tr>
                <tr>
                    <td class="label">Darba vieta</td>
                    <td>{escape(workplace_label)}</td>
                </tr>
                <tr>
                    <td class="label">Iemesls</td>
                    <td>{escape(reason)}</td>
                </tr>
                <tr>
                    <td class="label">Komentārs</td>
                    <td>{escape(self._format_optional(comment))}</td>
                </tr>
                <tr>
                    <td class="label">Admin komentārs</td>
                    <td>{escape(self._format_optional(admin_comment))}</td>
                </tr>
            </table>
            <a href="{escape(settings.FRONTEND_URL)}/change-requests" class="button">Atvērt manus pieprasījumus</a>
            """,
            accent_color="#16a34a" if status == "approved" else "#dc2626",
        )

        return await self.send_email(to_email, subject, html_content, text_content)
