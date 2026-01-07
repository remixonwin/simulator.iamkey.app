# Use debian for better tool compatibility
FROM debian:bookworm-slim as builder

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Install foundry
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN foundryup

WORKDIR /app

# Copy contract sources
COPY contracts/ ./contracts/
COPY deploy.sh ./
COPY foundry.toml ./
COPY remappings.txt ./

# Copy local libs if they exist
COPY lib/ ./lib/

# Ensure deploy.sh is executable
RUN chmod +x deploy.sh

# Create artifacts directory and ensure it's writable
RUN mkdir -p /app/artifacts && chmod 777 /app/artifacts

CMD ["./deploy.sh"]
