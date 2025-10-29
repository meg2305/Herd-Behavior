Herd Alerter — Local Run Guide

This project demonstrates a real-time "herd behavior" detection pipeline using:
- Apache Kafka (Zookeeper + Kafka broker) via Docker Compose
- Collector (Node.js) — receives tracker events from browsers and publishes to Kafka
- Stream processor (Faust) — consumes `user_events` and produces `alerts` topic using moving-average / z-score detection
- Backend (FastAPI) — WebSocket server that receives alerts and broadcasts to connected dashboards
- Frontend (React) — Dashboard that connects to backend WebSocket and shows "Trending Now"

Prerequisites
- Docker Desktop (Windows) with WSL2 or Hyper-V enabled
- Node.js (for local frontend development) and npm
- Python 3.10+ (optional, for running backend/stream-processor outside Docker)

Quick local run (Docker Compose)
1. Open PowerShell in the project root folder (where `infra/docker-compose.yml` lives).
2. Build and start services:

```powershell
docker compose -f infra\docker-compose.yml up --build
```

This will start Zookeeper, Kafka, Kafdrop (UI), collector, backend. The stream processor image will also be built; Faust may require extra time to start.

Service ports (default):
- Collector (HTTP): http://localhost:3000
- Backend (FastAPI + WebSocket): http://localhost:8000 (WS: ws://localhost:8000/ws)
- Kafdrop UI: http://localhost:9000

Frontend (React)
1. Open a separate PowerShell and run:

```powershell
cd frontend
npm install
npm start
```

This starts the React dev server (http://localhost:3000 by default; project configured to use 3000 — if port conflict occurs, follow the prompt to use another port or edit `frontend/package.json`).

Tracker snippet
- The lightweight JS tracker is in `frontend/tracker_snippet.js`. Include it on a product page and call `HerdTracker.trackEvent('view_product', 'product-123')` to send events.

Testing / Simulation
- You can POST events directly to the collector at `http://localhost:3000/track`.
- Backend exposes `POST /simulate/spike/{product_id}` to simulate a burst and broadcast a fake alert.

If you want the backend to broadcast alerts produced by the Faust stream processor, the backend consumes Kafka and will also consume the `alerts` topic (this is configured in `backend/main.py`).

Troubleshooting
- If Kafka connections fail, ensure Docker Desktop is running and `docker compose` started Kafka successfully.
- Check logs with `docker compose -f infra\docker-compose.yml logs -f backend` or `collector`.

More details are in the repository source files.
