FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app

WORKDIR /app/services/destination_service
EXPOSE 8004
CMD ["python", "main.py"]
