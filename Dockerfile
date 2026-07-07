# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency files first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy the rest of the source code
COPY . .

# Create uploads directory (in case it's not in the image)
RUN mkdir -p uploads

# Expose the application port
EXPOSE 7706

# Start the server
CMD ["node", "src/server.js"]
