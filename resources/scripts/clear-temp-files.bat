@echo off
echo [Temp Cleanup] Cleaning temporary files...
del /q /f /s %TEMP%\* 2>nul
del /q /f /s C:\Windows\Temp\* 2>nul
echo [Temp Cleanup] Temporary files cleaned.
