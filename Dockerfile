FROM node:18

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip

# Set working dir
WORKDIR /app

# Copy everything
COPY . .

# Install Node deps
RUN cd server && npm install

# Install Python deps
RUN pip3 install -r server/requirements.txt

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server/index.js"]