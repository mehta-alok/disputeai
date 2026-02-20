#!/bin/bash

# AccuDefend - Production Startup Script
# Starts the full stack with Docker

set -e

echo "=========================================="
echo "  AccuDefend - Chargeback Defense Platform"
echo "  Production Environment Startup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

echo -e "${GREEN}Docker is running...${NC}"

# Build and start all services
echo ""
echo -e "${YELLOW}Building and starting all services...${NC}"
docker compose up --build -d

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}Waiting for services to be ready...${NC}"

for i in {1..60}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}Backend API is healthy!${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 60 ]; then echo -e "\n${RED}Backend did not become healthy in 60s${NC}"; fi
done

echo ""
echo "=========================================="
echo -e "${GREEN}AccuDefend is Running!${NC}"
echo "=========================================="
echo ""
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo "  Health:     http://localhost:8000/health"
echo ""
echo "  Demo Login:"
echo "    Email:    admin@accudefend.com"
echo "    Password: AccuAdmin123!"
echo ""
echo "  Commands:"
echo "    View logs:      docker compose logs -f"
echo "    Stop services:  docker compose down"
echo "    Restart:        docker compose restart"
echo ""
