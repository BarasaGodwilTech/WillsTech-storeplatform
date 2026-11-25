# Build this from the PROJECT ROOT (not the backend folder), e.g.:
#   docker build -f backend/Dockerfile -t willstechstore-backend .
# docker-compose.yml at the project root already does this for you.
FROM node:20-alpine

WORKDIR /app

# Install backend dependencies first (better layer caching).
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev

# Copy the whole project (frontend + backend) — server.js serves both.
COPY . .

WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "server.js"]
