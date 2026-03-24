Write-Host "[DNS Cache] Clearing DNS cache..."
Clear-DnsClientCache
Restart-Service -Name Dnscache -Force
Write-Host "[DNS Cache] DNS cache cleared and service restarted."
