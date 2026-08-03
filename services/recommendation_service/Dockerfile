FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app

WORKDIR /app/services/recommendation_service
EXPOSE 8003
CMD ["python", "main.py"]
