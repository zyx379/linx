@echo off
REM linx Windows 服务入口（无 pause，供 nssm 调用）
chcp 65001 >nul
cd /d "%~dp0"
if not exist linx.env copy /Y linx.env.example linx.env >nul 2>&1

REM 优先 linx.exe；其次 node pkg-bundle.cjs（单文件）；最后 node dist\index.js
if exist "%~dp0linx.exe" (
  "%~dp0linx.exe"
  exit /b %ERRORLEVEL%
)

where node >nul 2>&1
if errorlevel 1 (
  echo [linx] node.exe not found. Install Node.js 18+ or put linx.exe in this folder.
  exit /b 1
)

if exist "%~dp0dist\pkg-bundle.cjs" (
  node "%~dp0dist\pkg-bundle.cjs"
  exit /b %ERRORLEVEL%
)

node "%~dp0dist\index.js"
exit /b %ERRORLEVEL%
