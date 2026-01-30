import logging
from typing import Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL
        self.from_name = settings.SMTP_FROM_NAME
        self.use_tls = settings.SMTP_TLS

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email."""
        if not self.smtp_user or not self.smtp_password:
            logger.warning("SMTP credentials not configured, skipping email send")
            return False

        try:
            message = MIMEMultipart("alternative")
            message["From"] = f"{self.from_name} <{self.from_email}>"
            message["To"] = to_email
            message["Subject"] = subject

            # Add text content
            if text_content:
                message.attach(MIMEText(text_content, "plain", "utf-8"))

            # Add HTML content
            message.attach(MIMEText(html_content, "html", "utf-8"))

            # Send email
            await aiosmtplib.send(
                message,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.smtp_user,
                password=self.smtp_password,
                start_tls=self.use_tls,
            )

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    async def send_missing_entries_notification(
        self,
        to_email: str,
        employee_name: str,
        missing_dates: list
    ) -> bool:
        """Send notification about missing time entries in Latvian."""
        subject = "HitexisTimeControl: Lūdzu, ievadiet darba stundas"

        dates_list = "\n".join([f"• {d.strftime('%d.%m.%Y')}" for d in missing_dates])
        dates_list_html = "".join([f"<li>{d.strftime('%d.%m.%Y')}</li>" for d in missing_dates])

        text_content = f"""
Labdien, {employee_name}!

Mēs pamanījām, ka pēdējās darba dienās jūs neesat ievadījis informāciju par darba laiku:

{dates_list}

Lūdzu, ieejiet sistēmā un aizpildiet datus:
{settings.FRONTEND_URL}

Ar cieņu,
HitexisTimeControl komanda
        """

        html_content = f"""
<!DOCTYPE html>
<html lang="lv">
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #3B3E41; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #279CF1; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ padding: 25px; background-color: #DFDFDF; }}
        .dates {{ background-color: #FFFFFF; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #279CF1; }}
        .dates ul {{ margin: 0; padding-left: 20px; }}
        .dates li {{ padding: 3px 0; color: #3B3E41; }}
        .button {{ display: inline-block; background-color: #279CF1; color: white; padding: 12px 24px;
                   text-decoration: none; border-radius: 5px; margin-top: 15px; font-weight: bold; }}
        .button:hover {{ background-color: #436597; }}
        .footer {{ text-align: center; padding: 20px; color: #436597; font-size: 12px; border-radius: 0 0 5px 5px; background-color: #DFDFDF; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>HitexisTimeControl</h1>
        </div>
        <div class="content">
            <p>Labdien, <strong>{employee_name}</strong>!</p>
            <p>Mēs pamanījām, ka pēdējās darba dienās jūs neesat ievadījis informāciju par darba laiku:</p>
            <div class="dates">
                <ul>
                    {dates_list_html}
                </ul>
            </div>
            <p>Lūdzu, ieejiet sistēmā un aizpildiet datus:</p>
            <a href="{settings.FRONTEND_URL}" class="button">Atvērt HitexisTimeControl</a>
        </div>
        <div class="footer">
            <p>Ar cieņu,<br>HitexisTimeControl komanda</p>
        </div>
    </div>
</body>
</html>
        """

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_weekly_planning_reminder(
        self,
        to_email: str,
        employee_name: str,
        week_start: str,
        week_end: str
    ) -> bool:
        """Send weekly reminder to plan office/remote days in Latvian."""
        subject = "HitexisTimeControl: Lūdzu, plānojiet darba vietu šai nedēļai"

        text_content = f"""
Labdien, {employee_name}!

Jauna darba nedēļa sākas ({week_start} - {week_end}).

Lūdzu, ieejiet sistēmā un norādiet, kurās dienās plānojat strādāt no biroja un kurās - attālināti:
{settings.FRONTEND_URL}/office

Tas palīdzēs kolēģiem plānot tikšanās un sadarbību!

Ar cieņu,
HitexisTimeControl komanda
        """

        html_content = f"""
<!DOCTYPE html>
<html lang="lv">
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #3B3E41; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #279CF1; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ padding: 25px; background-color: #DFDFDF; }}
        .week-info {{ background-color: #FFFFFF; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #279CF1; text-align: center; }}
        .week-info .dates {{ font-size: 18px; font-weight: bold; color: #279CF1; }}
        .icons {{ text-align: center; margin: 20px 0; font-size: 32px; }}
        .button {{ display: inline-block; background-color: #279CF1; color: white; padding: 12px 24px;
                   text-decoration: none; border-radius: 5px; margin-top: 15px; font-weight: bold; }}
        .button:hover {{ background-color: #436597; }}
        .footer {{ text-align: center; padding: 20px; color: #436597; font-size: 12px; border-radius: 0 0 5px 5px; background-color: #DFDFDF; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 HitexisTimeControl</h1>
        </div>
        <div class="content">
            <p>Labdien, <strong>{employee_name}</strong>!</p>
            <p>Jauna darba nedēļa sākas!</p>
            <div class="week-info">
                <div class="dates">{week_start} - {week_end}</div>
            </div>
            <div class="icons">
                🏢 ↔️ 🏠
            </div>
            <p>Lūdzu, ieejiet sistēmā un norādiet, kurās dienās plānojat strādāt no biroja un kurās - attālināti.</p>
            <p>Tas palīdzēs kolēģiem plānot tikšanās un sadarbību!</p>
            <p style="text-align: center;">
                <a href="{settings.FRONTEND_URL}/office" class="button">Plānot darba vietu</a>
            </p>
        </div>
        <div class="footer">
            <p>Ar cieņu,<br>HitexisTimeControl komanda</p>
        </div>
    </div>
</body>
</html>
        """

        return await self.send_email(to_email, subject, html_content, text_content)

    async def send_change_request_notification(
        self,
        to_email: str,
        admin_name: str,
        employee_name: str,
        request_type: str,
        request_date: str,
        reason: str
    ) -> bool:
        """Send notification about new change request to admin."""
        subject = f"HitexisTimeControl: Jauns izmaiņu pieprasījums no {employee_name}"

        text_content = f"""
Labdien, {admin_name}!

{employee_name} ir iesniedzis jaunu izmaiņu pieprasījumu:

Pieprasījuma veids: {request_type}
Datums: {request_date}
Iemesls: {reason}

Lūdzu, pārskatiet pieprasījumu sistēmā:
{settings.FRONTEND_URL}/admin/change-requests

Ar cieņu,
HitexisTimeControl komanda
        """

        html_content = f"""
<!DOCTYPE html>
<html lang="lv">
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #3B3E41; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #fa8c16; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ padding: 25px; background-color: #DFDFDF; }}
        .info-row {{ background-color: #FFFFFF; padding: 12px 15px; border-radius: 5px; margin: 10px 0; }}
        .label {{ font-weight: bold; color: #666; }}
        .button {{ display: inline-block; background-color: #fa8c16; color: white; padding: 12px 24px;
                   text-decoration: none; border-radius: 5px; margin-top: 15px; font-weight: bold; }}
        .button:hover {{ background-color: #d46b08; }}
        .footer {{ text-align: center; padding: 20px; color: #436597; font-size: 12px; border-radius: 0 0 5px 5px; background-color: #DFDFDF; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 Jauns izmaiņu pieprasījums</h1>
        </div>
        <div class="content">
            <p>Labdien, <strong>{admin_name}</strong>!</p>
            <p>{employee_name} ir iesniedzis jaunu izmaiņu pieprasījumu:</p>

            <div class="info-row">
                <span class="label">Pieprasījuma veids:</span> {request_type}
            </div>
            <div class="info-row">
                <span class="label">Datums:</span> {request_date}
            </div>
            <div class="info-row">
                <span class="label">Iemesls:</span> {reason}
            </div>

            <p style="text-align: center;">
                <a href="{settings.FRONTEND_URL}/admin/change-requests" class="button">Pārskatīt pieprasījumu</a>
            </p>
        </div>
        <div class="footer">
            <p>Ar cieņu,<br>HitexisTimeControl komanda</p>
        </div>
    </div>
</body>
</html>
        """

        return await self.send_email(to_email, subject, html_content, text_content)
