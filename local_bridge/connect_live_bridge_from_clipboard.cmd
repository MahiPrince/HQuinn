@echo off
setlocal EnableExtensions DisableDelayedExpansion

title HQuinn Live Local Intelligence
set "HQUINN_RENDER_URL=https://hquinn-relay-demo.onrender.com"
set "HQUINN_BRIDGE_MODE=live"
set "HQUINN_BRIDGE_TOKEN="

echo HQuinn live local-intelligence bridge
echo.
echo IMPORTANT: This prototype sends the tester's current message through Render.
echo CMD evidence, indexes, and Codex credentials remain on this laptop.
echo Use only non-confidential test scenarios until production approval.
echo.
echo Reading BRIDGE_TOKEN from the Windows clipboard...

for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -Command "$value = Get-Clipboard -Raw; if ($null -ne $value) { [Console]::Out.Write($value.Trim()) }"`) do set "HQUINN_BRIDGE_TOKEN=%%T"

if not defined HQUINN_BRIDGE_TOKEN (
    echo.
    echo ERROR: The clipboard is empty.
    echo Copy BRIDGE_TOKEN from Render, then run this CMD file again.
    pause
    exit /b 1
)

echo Token loaded without displaying it.
echo Starting live local intelligence...
echo.
call "%~dp0start_bridge.cmd"
exit /b %ERRORLEVEL%
