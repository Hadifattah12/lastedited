FROM node:22-slim

WORKDIR /app

COPY . .

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm install

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Go back to root
WORKDIR /app

# Install ngrok globally
RUN npm install -g ngrok

# Make entrypoint executable
RUN chmod +x entrypoint.sh

EXPOSE 3000 5173

CMD ["./entrypoint.sh"]
