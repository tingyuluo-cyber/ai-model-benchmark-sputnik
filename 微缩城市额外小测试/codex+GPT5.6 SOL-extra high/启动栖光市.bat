@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "http://127.0.0.1:4180"
call npx http-server dist -p 4180 -c-1
