@echo off
setlocal

set "ROOT=%~dp0.."
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if "%TMDB_ID_LOOKUP_CHECK_TEST_MODE%"=="1" if defined TMDB_ID_LOOKUP_CHECK_TEST_NODE set "BUNDLED_NODE=%TMDB_ID_LOOKUP_CHECK_TEST_NODE%"

if not exist "%BUNDLED_NODE%" goto system_node

"%BUNDLED_NODE%" "%ROOT%\scripts\check-all.mjs"
exit /b %ERRORLEVEL%

:system_node
node "%ROOT%\scripts\check-all.mjs"
exit /b %ERRORLEVEL%
