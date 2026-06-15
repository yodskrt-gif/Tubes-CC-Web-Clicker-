# Use Node.js Alpine as base for a lightweight image
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Create directory for database volume
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app

# Run as non-root user for security
USER node

# Expose server port
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production
ENV PORT=3000

# Start application
CMD ["npm", "start"]
