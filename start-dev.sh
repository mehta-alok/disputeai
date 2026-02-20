#!/bin/bash

# AccuDefend - Full Stack Local Development Launcher
# Starts PostgreSQL, Redis, Backend API, and Frontend
# Works for both desktop browser and mobile (via LAN IP)

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Get LAN IP for mobile access
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${BLUE}${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}${BOLD}║        AccuDefend - Full Stack Dev Launcher           ║${NC}"
echo -e "${BLUE}${BOLD}║   Desktop + Mobile Local Development Environment     ║${NC}"
echo -e "${BLUE}${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Check Docker ───────────────────────────────────────────────
DOCKER_AVAILABLE=false
if docker info > /dev/null 2>&1; then
    DOCKER_AVAILABLE=true
    echo -e "${GREEN}[OK]${NC} Docker is running"
else
    echo -e "${YELLOW}[WARN]${NC} Docker not running — will start in Demo Mode (no DB/Redis)"
    echo -e "       To enable full mode: open Docker Desktop, then re-run this script"
fi

# ── Step 2: Start PostgreSQL + Redis via Docker (if available) ─────────
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo ""
    echo -e "${CYAN}Starting PostgreSQL & Redis...${NC}"
    docker compose -f docker-compose.dev.yml up -d 2>/dev/null || \
    docker-compose -f docker-compose.dev.yml up -d 2>/dev/null

    # Wait for healthy services
    echo -n "  Waiting for PostgreSQL"
    for i in {1..20}; do
        if docker exec accudefend-postgres pg_isready -U accudefend_user -q 2>/dev/null; then
            echo -e " ${GREEN}ready${NC}"
            break
        fi
        echo -n "."
        sleep 1
        if [ $i -eq 20 ]; then echo -e " ${YELLOW}timeout (will use demo mode)${NC}"; fi
    done

    echo -n "  Waiting for Redis"
    for i in {1..10}; do
        if docker exec accudefend-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            echo -e " ${GREEN}ready${NC}"
            break
        fi
        echo -n "."
        sleep 1
        if [ $i -eq 10 ]; then echo -e " ${YELLOW}timeout (will proceed without)${NC}"; fi
    done
fi

# ── Step 3: Generate Prisma Client (if DB available) ──────────────────
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo ""
    echo -e "${CYAN}Generating Prisma client...${NC}"
    cd "$ROOT_DIR/backend"
    npx prisma generate 2>/dev/null && echo -e "  ${GREEN}Prisma client generated${NC}" || echo -e "  ${YELLOW}Prisma generate skipped${NC}"

    # Run migrations
    echo -e "${CYAN}Running database migrations...${NC}"
    npx prisma db push --accept-data-loss 2>/dev/null && echo -e "  ${GREEN}Database schema synced${NC}" || echo -e "  ${YELLOW}Migration skipped (will use demo mode)${NC}"
    cd "$ROOT_DIR"
fi

# ── Step 4: Start Backend ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}Starting Backend API (port 8000)...${NC}"
cd "$ROOT_DIR/backend"
NODE_ENV=development node server.js &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"
cd "$ROOT_DIR"

# Wait for backend health
echo -n "  Waiting for API"
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 30 ]; then echo -e " ${YELLOW}still starting...${NC}"; fi
done

# ── Step 5: Start Frontend ────────────────────────────────────────────
echo ""
echo -e "${CYAN}Starting Frontend (port 3000)...${NC}"
cd "$ROOT_DIR/frontend"
npx vite --host &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"
cd "$ROOT_DIR"

# Wait for frontend
sleep 3

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           AccuDefend is RUNNING!                      ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Desktop:${NC}"
echo -e "    Frontend:  ${CYAN}http://localhost:3000${NC}"
echo -e "    Backend:   ${CYAN}http://localhost:8000${NC}"
echo ""
echo -e "  ${BOLD}Mobile (same WiFi):${NC}"
echo -e "    Open on phone: ${CYAN}http://${LAN_IP}:3000${NC}"
echo ""
echo -e "  ${BOLD}Demo Login:${NC}"
echo -e "    Email:    ${YELLOW}admin@accudefend.com${NC}"
echo -e "    Password: ${YELLOW}AccuAdmin123!${NC}"
echo ""
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo -e "  ${BOLD}Database:${NC}  PostgreSQL on localhost:5432"
    echo -e "  ${BOLD}Cache:${NC}     Redis on localhost:6379"
else
    echo -e "  ${YELLOW}Running in Demo Mode (no database)${NC}"
fi
echo ""
echo -e "  ${BOLD}Stop all:${NC}  Press Ctrl+C"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down AccuDefend...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "  Stopping Docker services..."
        docker compose -f "$ROOT_DIR/docker-compose.dev.yml" stop 2>/dev/null || \
        docker-compose -f "$ROOT_DIR/docker-compose.dev.yml" stop 2>/dev/null
    fi
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
