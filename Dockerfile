FROM node:18

# Install Python + venv support
RUN apt-get update && apt-get install -y python3 python3-venv python3-pip

WORKDIR /app

# Copy project
COPY . .

# Install Node deps
RUN cd server && npm install

# Create Python virtual environment
RUN python3 -m venv /opt/venv

# Activate venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python deps inside venv
RUN pip install --upgrade pip
RUN pip install -r server/requirements.txt

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server/index.js"]