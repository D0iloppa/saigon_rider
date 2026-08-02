FROM python:3.12-slim

WORKDIR /app

# postgresql-client: 게이트9 B-5 정기백업 잡(app/jobs/backup_db.py)이 pg_dump 사용.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# 유가 자동수집(A): Playwright Chromium 헤드리스 + 시스템 의존성
RUN playwright install --with-deps chromium

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]
