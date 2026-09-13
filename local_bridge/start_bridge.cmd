@echo off
setlocal EnableExtensions

title HQuinn Laptop Bridge
set "BRIDGE_ROOT=%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
    for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_FALLBACK set "NODE_FALLBACK=%%N"
    if defined NODE_FALLBACK set "NODE_EXE=%NODE_FALLBACK%"
)

if not exist "%NODE_EXE%" (
    echo ERROR: The Node.js runtime bundled with Codex was not found.
    echo Open or update the Codex desktop app, then run this file again.
    pause
    exit /b 1
)

if not defined HQUINN_RENDER_URL set /p "HQUINN_RENDER_URL=Render URL, for example https://hquinn-relay-demo.onrender.com: "
if not defined HQUINN_BRIDGE_TOKEN set /p "HQUINN_BRIDGE_TOKEN=Bridge token from Render: "

echo.
echo [1] Connection-only test - no private data leaves this laptop
echo [2] Live local intelligence - sends prompts and answers through Render
choice /c 12 /n /m "Choose mode [1-2]: "
if errorlevel 2 (
    set "HQUINN_BRIDGE_MODE=live"
) else (
    set "HQUINN_BRIDGE_MODE=echo"
)

echo.
"%NODE_EXE%" "%BRIDGE_ROOT%bridge.mjs"
set "BRIDGE_EXIT=%ERRORLEVEL%"
echo.
if not "%BRIDGE_EXIT%"=="0" echo The bridge stopped with exit code %BRIDGE_EXIT%.
pause
exit /b %BRIDGE_EXIT%

