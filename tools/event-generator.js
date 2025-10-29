const axios = require('axios');
const fs = require('fs');
const path = require('path');

const COLLECTOR_URL = 'http://localhost:3000/track';
const BACKEND_URL = 'http://localhost:8000';
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// Enhanced event types with realistic distribution
const EVENT_TYPES = [
  { type: 'view_product', weight: 65 },
  { type: 'add_to_cart', weight: 20 },
  { type: 'purchase', weight: 10 },
  { type: 'share_product', weight: 5 }
];

// Load products from file
function loadProducts() {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(data).products;
  } catch (error) {
    console.error('❌ Error loading products:', error.message);
    
    const sampleProducts = {
      products: [
        {
          product_id: "sneaker-limited-001",
          product_name: "Limited Edition Sneakers",
          category: "footwear",
          price: 199.99,
          brand: "Nike",
          trending_potential: "high"  // Mark products that can trend
        },
        {
          product_id: "wireless-headphones-2024", 
          product_name: "Wireless Noise Cancelling Headphones",
          category: "electronics",
          price: 299.99,
          brand: "Sony",
          trending_potential: "medium"
        },
        {
          product_id: "gaming-laptop-pro",
          product_name: "Professional Gaming Laptop", 
          category: "electronics",
          price: 1599.99,
          brand: "Alienware",
          trending_potential: "low"
        },
        {
          product_id: "smartwatch-premium",
          product_name: "Premium Smartwatch",
          category: "electronics", 
          price: 399.99,
          brand: "Apple",
          trending_potential: "medium"
        },
        {
          product_id: "yoga-mat-pro",
          product_name: "Professional Yoga Mat",
          category: "fitness",
          price: 89.99,
          brand: "Lululemon",
          trending_potential: "high"
        }
      ]
    };
    
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(sampleProducts, null, 2));
    console.log('✅ Created products.json with sample data');
    return sampleProducts.products;
  }
}

// Get weighted random event type
function getRandomEventType() {
  const random = Math.random() * 100;
  let cumulativeWeight = 0;
  
  for (const event of EVENT_TYPES) {
    cumulativeWeight += event.weight;
    if (random <= cumulativeWeight) {
      return event.type;
    }
  }
  return 'view_product';
}

// Generate random user data
function generateUserData() {
  const regions = ['US', 'EU', 'ASIA', 'LATAM'];
  const devices = ['mobile', 'desktop', 'tablet'];
  
  return {
    user_id: `user-${Math.floor(Math.random() * 10000)}`,
    session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    region: regions[Math.floor(Math.random() * regions.length)],
    device: devices[Math.floor(Math.random() * devices.length)]
  };
}

// Send event to collector
async function sendEvent(product, eventType) {
  const event = {
    event_type: eventType,
    ...product,
    ...generateUserData(),
    timestamp: new Date().toISOString()
  };

  try {
    const response = await axios.post(COLLECTOR_URL, event);
    console.log(`✅ ${eventType} for ${product.product_name}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send ${eventType} for ${product.product_name}:`, error.message);
    return false;
  }
}

// Check current trending status
async function checkTrendingStatus() {
  try {
    const response = await axios.get(`${BACKEND_URL}/alerts`);
    const alerts = response.data.alerts;
    
    console.log('\n📊 CURRENT TRENDING STATUS:');
    console.log('========================');
    
    if (alerts && alerts.length > 0) {
      alerts.forEach((alert, index) => {
        const trendIcon = alert.trend === 'up' ? '📈' : '📉';
        console.log(`${index + 1}. ${trendIcon} ${alert.product}: ${alert.views} views (${alert.trend})`);
      });
    } else {
      console.log('No trending products detected yet');
    }
    console.log('========================\n');
    
    return alerts;
  } catch (error) {
    console.log('❌ Could not fetch trending status');
    return [];
  }
}

// Generate herd behavior spike for a specific product
async function generateSpike(product, durationMs = 20000, eventsPerSecond = 3) {
  console.log(`\n🔥 CREATING HERD BEHAVIOR SPIKE FOR: ${product.product_name}`);
  console.log(`⏰ Duration: ${durationMs/1000}s | 📊 Rate: ${eventsPerSecond} events/sec`);
  
  const startTime = Date.now();
  let eventCount = 0;
  let successCount = 0;

  while (Date.now() - startTime < durationMs) {
    const promises = [];
    
    // Send multiple events in parallel to simulate herd behavior
    for (let i = 0; i < eventsPerSecond; i++) {
      promises.push(sendEvent(product, 'view_product'));
    }
    
    const results = await Promise.all(promises);
    successCount += results.filter(Boolean).length;
    eventCount += eventsPerSecond;
    
    // Show progress
    const elapsed = Date.now() - startTime;
    const progress = Math.min((elapsed / durationMs) * 100, 100).toFixed(1);
    process.stdout.write(`\r🔄 Progress: ${progress}% | Events: ${successCount}/${eventCount}`);
    
    // Wait for next second
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n🎯 SPIKE COMPLETED: ${successCount} events sent for ${product.product_name}`);
}

// Generate gradual trend (more realistic)
async function generateGradualTrend(product, durationMs = 45000) {
  console.log(`\n🌊 CREATING GRADUAL TREND FOR: ${product.product_name}`);
  
  const startTime = Date.now();
  let phase = 1;
  
  while (Date.now() - startTime < durationMs) {
    const elapsed = Date.now() - startTime;
    const progress = (elapsed / durationMs) * 100;
    
    // Three phases: slow start → rapid growth → plateau
    if (progress < 30 && phase === 1) {
      // Phase 1: Slow growth (1 event every 2-4 seconds)
      await sendEvent(product, 'view_product');
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
    } else if (progress < 70 && phase === 1) {
      // Phase 2: Rapid growth (switch to faster rate)
      console.log(`\n📈 Entering rapid growth phase for ${product.product_name}`);
      phase = 2;
    } else if (progress < 70 && phase === 2) {
      // Phase 2: 2-3 events per second
      const batchSize = 2 + Math.floor(Math.random() * 2);
      await Promise.all(
        Array(batchSize).fill().map(() => sendEvent(product, 'view_product'))
      );
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else if (phase === 2) {
      // Phase 3: Plateau (slower but sustained)
      console.log(`\n📊 Entering plateau phase for ${product.product_name}`);
      phase = 3;
      await sendEvent(product, 'view_product');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      // Phase 3 continued
      await sendEvent(product, 'view_product');
      await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
    }
  }
  
  console.log(`\n✅ GRADUAL TREND COMPLETED: ${product.product_name}`);
}

// Main function with interactive flow
async function main() {
  console.log('🚀 STARTING HERD BEHAVIOR EVENT GENERATOR');
  console.log('=========================================\n');
  
  const products = loadProducts();
  console.log(`📦 Loaded ${products.length} products from catalog\n`);

  // Test services connectivity
  try {
    await axios.get('http://localhost:3000/health');
    console.log('✅ Collector service: ONLINE');
  } catch (error) {
    console.error('❌ Collector service: OFFLINE');
    console.log('💡 Run: docker-compose up -d from the infra directory');
    process.exit(1);
  }

  try {
    await axios.get(`${BACKEND_URL}/health`);
    console.log('✅ Backend service: ONLINE');
  } catch (error) {
    console.error('❌ Backend service: OFFLINE');
  }

  // Show initial trending status
  await checkTrendingStatus();

  // Phase 1: Normal background traffic
  console.log('🔄 GENERATING NORMAL BACKGROUND TRAFFIC (15 events)...');
  
  for (let i = 0; i < 15; i++) {
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    const eventType = getRandomEventType();
    
    await sendEvent(randomProduct, eventType);
    
    // Random delay between events
    const delay = 1000 + Math.random() * 3000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Check status after normal traffic
  await checkTrendingStatus();

  // Phase 2: Create herd behavior
  console.log('\n--- HERD BEHAVIOR SIMULATION STARTING ---');
  
  const trendingProduct = products.find(p => p.trending_potential === "high") || products[0];
  
  // Option A: Sudden spike (viral moment)
  await generateSpike(trendingProduct, 25000, 4);
  
  // Option B: Gradual trend (organic growth)
  // await generateGradualTrend(trendingProduct, 40000);

  // Check final trending status
  console.log('\n--- FINAL TRENDING RESULTS ---');
  await checkTrendingStatus();

  // Phase 3: Additional products with moderate activity
  console.log('\n🔄 GENERATING SECONDARY PRODUCT ACTIVITY...');
  const secondaryProducts = products.filter(p => p.product_id !== trendingProduct.product_id).slice(0, 2);
  
  for (const product of secondaryProducts) {
    for (let i = 0; i < 5; i++) {
      await sendEvent(product, Math.random() > 0.7 ? 'add_to_cart' : 'view_product');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Final status check
  console.log('\n--- SIMULATION COMPLETE ---');
  await checkTrendingStatus();

  console.log('\n🎉 EVENT GENERATION COMPLETED!');
  console.log('=========================================');
  console.log('📊 Check Kafdrop:    http://localhost:9000');
  console.log('🔔 Check Alerts:     http://localhost:8000/alerts');
  console.log('📈 Check Trending:   http://localhost:3001 (React App)');
  console.log('📋 Check Logs:       docker-compose logs backend');
  console.log('=========================================\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { loadProducts, sendEvent, generateSpike, checkTrendingStatus };