@echo off
echo [DNS Cache] Clearing DNS cache...
ipconfig /flushdns
net stop dnscache >nul 2>nul
net start dnscache >nul 2>nul
echo [DNS Cache] DNS cache cleared.
