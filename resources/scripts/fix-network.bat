@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [Fix Network] Starting network reset...
ipconfig /release
ipconfig /flushdns
ipconfig /renew
netsh winsock reset
echo [Fix Network] Network reset complete.
