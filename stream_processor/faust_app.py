import faust
import json
import math
from statistics import mean, pstdev

APP_NAME = 'herd-detector'
KAFKA_BROKER = 'kafka://localhost:9092'  # when running in Docker network, use kafka:9092

app = faust.App(APP_NAME, broker=KAFKA_BROKER)
events = app.topic('user_events', value_type=bytes)
alerts_topic = app.topic('alerts', partitions=1, value_type=bytes)

# short window: 1 minute tumbling
SHORT_WINDOW = 60.0  # seconds
# baseline window: 30 minutes tumbling/hopping (we'll use tumbling 30min windows for simplicity)
BASELINE_WINDOW = 30 * 60.0

min_count = 5
z_threshold = 3.0
epsilon = 1e-6

# counts per product per short window
short_counts = app.Table('short_counts', default=int).tumbling(SHORT_WINDOW, expires=BASELINE_WINDOW*2)
# baseline sample store as a simple list of past short-window counts
baseline_store = app.Table('baseline_store', default=list)

@app.agent(events)
async def process(stream):
    async for raw in stream:
        try:
            ev = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
            pid = ev.get('product_id')
            if not pid:
                continue
            # increment current short window count
            short_counts[pid] += 1
        except Exception as e:
            app.logger.error('bad event %r', e)

# window callback - Faust doesn't provide a super direct on-window-complete hook in older releases,
# so we can run a cron that checks the most recent short window counts and calculates baseline.
@app.timer(interval=5.0)  # every 5s check (coarse)
async def detect():
    # copy keys
    keys = list(short_counts.keys())
    for pid in keys:
        curr = short_counts[pid].now()  # current window count
        # append to baseline store (limit size)
        bl = baseline_store[pid]
        bl.append(curr)
        # keep at most baseline window length (30min / 1min = 30 samples)
        if len(bl) > 60:  # some breathing room
            bl.pop(0)
        baseline_store[pid] = bl

        # compute baseline stats ignoring current sample if insufficient history
        hist = [x for x in bl[:-1]] if len(bl) > 1 else []
        if len(hist) < 5:
            continue

        m = mean(hist)
        s = pstdev(hist) if len(hist) > 1 else 0.0

        if curr >= min_count:
            z = (curr - m) / (s + epsilon)
            if (s < 1 and curr >= m * 3) or (z > z_threshold):
                alert = {
                    "product_id": pid,
                    "current_count": curr,
                    "baseline_mean": m,
                    "baseline_std": s,
                    "z_score": z,
                    "detected_at": app.now().isoformat()
                }
                await alerts_topic.send(value=json.dumps(alert).encode())
                # optionally clear recent counts to avoid alert storm for same spike
                short_counts[pid] = 0
