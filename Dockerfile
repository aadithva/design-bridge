# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc
RUN cd client && npm ci && npx vite build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/agent ./agent
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Create data and reports directories for persistent storage
RUN mkdir -p /app/data /app/reports

EXPOSE 3001
VOLUME ["/app/data", "/app/reports"]
CMD ["node", "dist/api/server.js"]
