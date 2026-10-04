@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
    python -m venv .venv
    if errorlevel 1 exit /b 1
)
call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
if not defined DATABASE_URL set DATABASE_URL=sqlite:///./fair_drop.db
python -m alembic upgrade head
if errorlevel 1 exit /b 1
python -m uvicorn app.main:app --reload --port 8000
