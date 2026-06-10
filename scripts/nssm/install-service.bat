@echo off
REM 以管理员身份运行此 bat 安装 linx Windows 服务
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo 请右键「以管理员身份运行」
  pause
  exit /b 1
)

REM Do not pass %~dp0 as -InstallDir: trailing backslash before " breaks cmd quoting.
REM Optional: set LINX_NODE=C:\Program Files\nodejs\node.exe if Node is not on admin PATH
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); & '%~dp0install-service.ps1'"
pause
