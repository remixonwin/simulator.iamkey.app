# Use a reliable pre-built Flutter image
FROM ghcr.io/cirruslabs/flutter:stable

WORKDIR /app

# Enable web support
RUN flutter config --enable-web

# Copy pubspec files
COPY pubspec.yaml ./
# Do NOT copy pubspec.lock to avoid version mismatches
# COPY pubspec.lock ./ 

# Get dependencies
RUN flutter pub get

# Copy source code
COPY . .

# Expose port
EXPOSE 5173

# Run in debug mode for faster startup, listening on all interfaces
# Force pub get at runtime to ensure packages are resolved correctly in the container environment
CMD ["sh", "-c", "flutter pub get && flutter run -d web-server --web-port=5173 --web-hostname=0.0.0.0"]
