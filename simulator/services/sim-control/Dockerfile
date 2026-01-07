FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Expose port
EXPOSE 4003

CMD ["npm", "run", "start"]
