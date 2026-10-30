FROM node:18-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --only=production || npm install --omit=dev

# Copy application source code
COPY server.js ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Use non-root node user provided by alpine node image
USER node

EXPOSE 5000

CMD ["node", "server.js"]

