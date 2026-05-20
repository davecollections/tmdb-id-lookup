@echo off
setlocal

set "ROOT=%~dp0.."
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
	"%BUNDLED_NODE%" "%ROOT%\scripts\check-frontend.mjs"
	exit /b %ERRORLEVEL%
)

node "%ROOT%\scripts\check-frontend.mjs"
exit /b %ERRORLEVEL%
