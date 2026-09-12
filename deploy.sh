#!/bin/bash
# SALAMANDA WIDS - macOS/Linux Deployment Script

echo "========================================"
echo "SALAMANDA WIDS - Deployment"
echo "========================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running!"
    echo "Please start Docker and wait for it to fully load."
    exit 1
fi

# Build and start the IDS
echo "Building and starting SALAMANDA WIDS..."
docker-compose up --build -d

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to start container"
    exit 1
fi

echo "========================================"
echo "SALAMANDA WIDS is now running!"
echo ""
echo "Access the dashboard at: http://localhost:3001"
echo ""
echo "Commands:"
echo "  docker-compose logs -f   (view logs)"
echo "  docker-compose stop      (stop)"
echo "  docker-compose restart   (restart)"
echo "========================================"