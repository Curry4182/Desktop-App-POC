@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [DNS Cache] Clearing DNS cache...
ipconfig /flushdns
net stop dnscache >nul 2>nul
net start dnscache >nul 2>nul
echo [DNS Cache] DNS cache cleared.
