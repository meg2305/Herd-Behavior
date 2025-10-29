from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from aiokafka import AIOKafkaConsumer
import asyncio
import json
import logging
import os
import aiohttp
from collections import defaultdict, deque
import statistics
from datetime import datetime, timedelta

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

KAFKA_BOOTSTRAP_SERVERS = "kafka:9092"
KAFKA_TOPIC = "user_events"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Store product activity for anomaly detection
product_activity = defaultdict(lambda: deque(maxlen=100))

class ConnectionManager:
    def __init__(self):
        self.active_connections = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                disconnected.append(connection)
        
        for connection in disconnected:
            self.active_connections.remove(connection)

manager = ConnectionManager()

async def send_slack_alert(alert: dict):
    """Send alert to Slack webhook if SLACK_WEBHOOK_URL is set."""
    webhook = os.getenv('SLACK_WEBHOOK_URL')
    if not webhook:
        return
    payload = {
        "text": f"🚨 Herd behavior detected for *{alert.get('product_id')}*\nViews: {alert.get('current_count')} | z: {alert.get('z_score')}",
        "attachments": [
            {
                "title": "Herd Alerter",
                "text": json.dumps(alert)
            }
        ]
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook, json=payload, timeout=10) as resp:
                if resp.status >= 400:
                    logger.warning(f"Slack webhook failed with status {resp.status}")
    except Exception as e:
        logger.exception(f"Failed to send Slack alert: {e}")

def detect_anomaly(product_id: str) -> dict:
    """Enhanced herd behavior detection with multiple metrics"""
    history = list(product_activity[product_id])
    
    if len(history) < 20:  # Increased minimum data
        return None
    
    current_time = datetime.utcnow()
    
    # Multiple time windows for better analysis
    windows = {
        'recent_30s': 30,      # Spike detection
        'recent_1m': 60,       # Short-term trend
        'baseline_2m': 120,    # Historical baseline
        'baseline_5m': 300     # Long-term baseline
    }
    
    counts = {}
    for window_name, seconds in windows.items():
        counts[window_name] = len([
            event_time for event_time in history 
            if (current_time - event_time).total_seconds() <= seconds
        ])
    
    recent_count = counts['recent_30s']
    baseline_count = counts['baseline_2m']
    
    # Multiple detection criteria
    if baseline_count >= 3 and recent_count >= 10:
        ratio = recent_count / baseline_count if baseline_count > 0 else float('inf')
        
        # Calculate enhanced z-score
        z_score = (recent_count - baseline_count) / (max(1, baseline_count) ** 0.5)
        
        # Velocity (events per minute)
        velocity_1m = counts['recent_1m']
        velocity_5m = counts['baseline_5m'] / 5  # Normalize to per-minute
        
        # Multiple trigger conditions
        ratio_trigger = ratio >= 2.5  # Lowered from 3.0 for sensitivity
        velocity_trigger = velocity_1m >= (velocity_5m * 3)  # 3x velocity increase
        absolute_trigger = recent_count >= 15  # Absolute threshold
        
        if ratio_trigger or velocity_trigger or absolute_trigger:
            confidence = min(100, max(0, z_score * 15 + 50))  # 0-100% confidence
            
            return {
                "product_id": product_id,
                "current_count": recent_count,
                "z_score": round(z_score, 2),
                "mean": round(baseline_count, 1),
                "ratio": round(ratio, 2),
                "velocity_1m": velocity_1m,
                "velocity_5m": round(velocity_5m, 1),
                "confidence": round(confidence, 1),
                "detected_at": current_time.isoformat(),
                "trigger_type": (
                    "ratio" if ratio_trigger else 
                    "velocity" if velocity_trigger else 
                    "absolute"
                )
            }
    
    return None
@app.on_event("startup")
async def startup_event():
    # Start both consumers: raw user events and pre-computed alerts
    asyncio.create_task(consume_events())
    asyncio.create_task(consume_alerts())

async def consume_events():
    """Consume raw user_events from Kafka and update in-memory activity window."""
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id="herd_backend_events",
        auto_offset_reset="earliest",
    )

    # Retry connection
    max_retries = 10
    for attempt in range(max_retries):
        try:
            await consumer.start()
            logger.info("✅ Kafka consumer for user_events connected and listening...")
            break
        except Exception as e:
            logger.warning(f"⚠️ Kafka connection failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(5)
            else:
                logger.error("💥 Failed to connect to Kafka after all retries")
                return

    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
            except Exception:
                logger.debug('Received non-json event, skipping')
                continue

            logger.info(f"📩 Received Event: {event.get('event_type')} for product {event.get('product_id')}")
            
            # Track product activity for anomaly detection
            product_id = event.get('product_id')
            if not product_id:
                continue
            product_activity[product_id].append(datetime.utcnow())
            
            # Check for herd behavior locally as a fallback
            alert = detect_anomaly(product_id)
            
            if alert:
                logger.info(f"🚨 HERD BEHAVIOR DETECTED (local): {product_id} (count: {alert['current_count']}, z-score: {alert['z_score']})")
                # Send alert to all connected WebSocket clients
                await manager.broadcast(json.dumps(alert))
                # send Slack if configured
                if os.getenv('SLACK_WEBHOOK_URL'):
                    await send_slack_alert(alert)

    except Exception as e:
        logger.error(f"⚠️ Kafka consumer error: {e}")
    finally:
        await consumer.stop()


async def consume_alerts():
    """Consume pre-computed alerts from the stream processor (alerts topic) and broadcast to clients."""
    consumer = AIOKafkaConsumer(
        "alerts",
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id="herd_backend_alerts",
        auto_offset_reset="earliest",
    )

    # Retry connection
    max_retries = 10
    for attempt in range(max_retries):
        try:
            await consumer.start()
            logger.info("✅ Kafka consumer for alerts connected and listening...")
            break
        except Exception as e:
            logger.warning(f"⚠️ Alerts Kafka connection failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(5)
            else:
                logger.error("💥 Failed to connect to Kafka alerts after all retries")
                return

    try:
        async for msg in consumer:
            try:
                alert = json.loads(msg.value.decode("utf-8"))
            except Exception:
                logger.debug('Received non-json alert, skipping')
                continue

            logger.info(f"🚨 Alert received from stream processor for product: {alert.get('product_id')}")
            # Broadcast alert payload directly to connected clients
            await manager.broadcast(json.dumps(alert))
            # send Slack if configured
            if os.getenv('SLACK_WEBHOOK_URL'):
                await send_slack_alert(alert)

    except Exception as e:
        logger.error(f"⚠️ Alerts consumer error: {e}")
    finally:
        await consumer.stop()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send welcome message
        await websocket.send_text(json.dumps({"message": "Connected to herd behavior alerts"}))
        
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
    except Exception as e:
        logger.info(f"WebSocket disconnected: {e}")
        manager.disconnect(websocket)

@app.get("/")
def home():
    return {"status": "Herd Behavior Backend Running", "kafka": KAFKA_BOOTSTRAP_SERVERS}

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "backend"}

@app.get("/alerts")
def get_alerts():
    # Return current detected alerts
    alerts = []
    for product_id in list(product_activity.keys()):
        alert = detect_anomaly(product_id)
        if alert:
            alerts.append({
                "product": product_id,
                "trend": "up", 
                "views": alert["current_count"]
            })
    
    # If no real alerts, return mock data for demo
    if not alerts:
        alerts = [
            {"product": "Limited Edition Sneakers", "trend": "up", "views": 132},
            {"product": "Wireless Headphones", "trend": "down", "views": 59},
        ]
    
    return {"alerts": alerts}

# HTTP endpoint for direct event submission (optional)
@app.post("/track")
async def track_event(event: dict):
    """Alternative endpoint for direct event submission"""
    try:
        product_id = event.get("product_id")
        if product_id:
            product_activity[product_id].append(datetime.utcnow())
            
            # Check for herd behavior
            alert = detect_anomaly(product_id)
            if alert:
                logger.info(f"🚨 HERD BEHAVIOR DETECTED via HTTP: {product_id}")
                await manager.broadcast(json.dumps(alert))
        
        return {"status": "accepted"}
    except Exception as e:
        logger.error(f"Error in track endpoint: {e}")
        return {"status": "error"}

# Additional endpoints for frontend
@app.get("/alerts/trending")
def get_trending_alerts():
    """Get only trending alerts (z-score > 3)"""
    trending_alerts = []
    for product_id in list(product_activity.keys()):
        alert = detect_anomaly(product_id)
        if alert and alert.get("z_score", 0) > 3:
            trending_alerts.append({
                "product": product_id,
                "trend": "up",
                "views": alert["current_count"],
                "z_score": alert["z_score"],
                "mean": alert["mean"]
            })
    
    if not trending_alerts:
        trending_alerts = [
            {"product": "Limited Edition Sneakers", "trend": "up", "views": 132, "z_score": 4.5, "mean": 40},
        ]
    
    return {"trending_alerts": trending_alerts}

@app.get("/alerts/active")
def get_active_alerts():
    """Get all active alerts"""
    return get_alerts()

@app.get("/alerts/history")
def get_alert_history():
    """Get alert history (mock data for now)"""
    return {
        "history": [
            {"product": "Limited Edition Sneakers", "timestamp": "2025-01-27T10:30:00Z", "views": 132, "z_score": 4.5},
            {"product": "Wireless Headphones", "timestamp": "2025-01-27T10:25:00Z", "views": 59, "z_score": 1.2},
            {"product": "Gaming Laptop", "timestamp": "2025-01-27T10:15:00Z", "views": 45, "z_score": 2.1},
        ]
    }

# Test endpoint to simulate herd behavior
@app.post("/simulate/spike/{product_id}")
async def simulate_spike(product_id: str):
    """Simulate herd behavior for testing"""
    current_time = datetime.utcnow()
    
    # Add multiple events in quick succession to trigger alert
    for i in range(15):
        product_activity[product_id].append(current_time)
    
    alert = detect_anomaly(product_id)
    if alert:
        await manager.broadcast(json.dumps(alert))
        return {"status": "spike_created", "alert": alert}
    else:
        return {"status": "no_alert_triggered"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)