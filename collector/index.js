require('dotenv').config();
const express = require('express');
const { Kafka } = require('kafkajs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');
const TOPIC = process.env.TOPIC || 'user_events';

// Initialize Kafka with better retry configuration
const kafka = new Kafka({ 
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 1000,
    retries: 10,
    maxRetryTime: 30000
  }
});

const producer = kafka.producer();
const app = express();

app.use(cors());
app.use(bodyParser.json());

// Health check
app.get('/health', (req, res) => {
  console.log('✅ Health check received');
  res.json({ 
    status: 'healthy', 
    service: 'event-collector',
    kafka_connected: false, // We'll update this when connected
    timestamp: new Date().toISOString()
  });
});
app.get('/test', (req, res) => {
  res.json({ message: 'Collector is working!' });
});
// Event tracking endpoint
app.post('/track', async (req, res) => {
  try {
    const event = {
      event_id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...req.body
    };

    if (!event.event_type || !event.product_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: event_type and product_id are required' 
      });
    }

    console.log(`📨 Tracking ${event.event_type} for product ${event.product_id}`);

    await producer.send({
      topic: TOPIC,
      messages: [{
        key: event.product_id,
        value: JSON.stringify(event)
      }]
    });

    res.status(202).json({ 
      status: 'accepted', 
      event_id: event.event_id 
    });

  } catch (err) {
    console.error('❌ Track error:', err);
    res.status(500).json({ 
      error: 'Failed to process event',
      details: err.message 
    });
  }
});

// Connect to Kafka with retries
async function connectToKafka() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    try {
      console.log(`🔌 Connecting to Kafka (attempt ${attempts + 1}/${maxAttempts})...`);
      await producer.connect();
      console.log('✅ Successfully connected to Kafka!');
      return;
    } catch (error) {
      attempts++;
      console.log(`❌ Kafka connection failed: ${error.message}`);
      
      if (attempts < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed to connect to Kafka after ${maxAttempts} attempts`);
      }
    }
  }
}

// Start server
async function start() {
  try {
    const port = process.env.PORT || 3000;
    
    // Start HTTP server immediately
    app.listen(port, () => {
      console.log(`🎯 Event collector running on port ${port}`);
    });

    // Connect to Kafka in background
    connectToKafka().catch(error => {
      console.error('💥 Kafka connection failed:', error.message);
      console.log('⚠️  Collector will continue running but events will fail');
    });

  } catch (err) {
    console.error('❌ Failed to start collector:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await producer.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await producer.disconnect();
  process.exit(0);
});

start();