@echo off
setlocal
if exist "%~dp0vips_lib\vips-dev-8.16\bin" set "VIPS_BIN=%~dp0vips_lib\vips-dev-8.16\bin"
if defined VIPS_BIN set "PATH=%VIPS_BIN%;%PATH%"
echo Installing dependencies...
python -m pip install -r requirements.txt
echo.
echo ================================================
echo   ZIP Digger
echo   Open in browser: http://localhost:5000
echo ================================================
echo.
python app.py
pause
