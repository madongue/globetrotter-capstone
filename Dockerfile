# Build React frontend
FROM node:20-alpine AS frontend
WORKDIR /globetrotter/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ .
RUN npm run build

# Build Python Flask backend
FROM python:3.11-slim AS backend
WORKDIR /globetrotter
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=frontend /globetrotter/client/dist ./client/dist

EXPOSE 5000
CMD ["python", "app/main.py"]
