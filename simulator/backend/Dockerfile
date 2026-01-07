FROM node:20-alpine

WORKDIR /app

# Copy backend source from main project
COPY backend/package*.json ./
COPY backend/src/ ./src/
COPY backend/tsconfig.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Build TypeScript
RUN npm run build

EXPOSE 3000

# Run the Node.js backend
ENV PORT=3000
CMD ["npm", "start"]
