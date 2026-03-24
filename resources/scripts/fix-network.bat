@echo off
echo [Fix Network] Starting network reset...
ipconfig /release
ipconfig /flushdns
ipconfig /renew
netsh winsock reset
echo [Fix Network] Network reset complete.
