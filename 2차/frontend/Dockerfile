# Node.js base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# 1. Build-time argument for the API URL
ARG NEXT_PUBLIC_API_URL

# 2. Set this as an environment variable
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Expose port and run application
EXPOSE 3000
CMD ["npm", "start"]
