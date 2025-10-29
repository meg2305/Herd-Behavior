import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import './TrendingList.css';

export default function TrendingList() {
  const [items, setItems] = useState([]);
  const [selectedView, setSelectedView] = useState('cards');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState('');

  // Fetch initial data from REST API
  useEffect(() => {
    fetchInitialAlerts();
  }, []);

  const fetchInitialAlerts = async () => {
    try {
      console.log('📡 Fetching initial alerts from REST API...');
      const response = await fetch('http://localhost:8000/alerts');
      const data = await response.json();
      console.log('📊 Initial alerts data:', data);
      
      if (data.alerts && Array.isArray(data.alerts)) {
        const formattedItems = data.alerts.map((alert, index) => ({
          id: alert.product.toLowerCase().replace(/ /g, '-') + '-' + index,
          product_id: alert.product.toLowerCase().replace(/ /g, '-'),
          product_name: alert.product,
          current_count: alert.views,
          z_score: alert.trend === 'up' ? 4.5 : 1.2,
          mean: Math.round(alert.views * 0.3),
          std_dev: Math.round(alert.views * 0.1),
          trend: alert.trend,
          updated_at: new Date().toISOString(),
          history: generateHistoryData(alert.views, alert.trend)
        }));
        setItems(formattedItems);
        console.log('✅ Items set:', formattedItems);
      }
    } catch (error) {
      console.error('❌ Failed to fetch initial alerts:', error);
    }
  };

  // Generate mock history data for charts
  const generateHistoryData = (currentViews, trend) => {
    const history = [];
    const now = new Date();
    
    for (let i = 9; i >= 0; i--) {
      const time = new Date(now.getTime() - (i * 60000)); // 10 minutes history
      const baseCount = trend === 'up' ? currentViews * 0.3 : currentViews * 0.7;
      const randomVariation = Math.random() * currentViews * 0.2;
      history.push({
        timestamp: time.toISOString(),
        count: Math.round(baseCount + randomVariation),
        z_score: trend === 'up' ? 2 + Math.random() * 3 : 1 + Math.random() * 2
      });
    }
    
    // Add current data point
    history.push({
      timestamp: new Date().toISOString(),
      count: currentViews,
      z_score: trend === 'up' ? 4.5 : 1.2
    });
    
    return history;
  };

  // WebSocket connection
  useEffect(() => {
    console.log('🔌 Connecting to WebSocket...');
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      setConnectionStatus('connected');
    };

    ws.onmessage = (evt) => {
      console.log('📨 WebSocket message received:', evt.data);
      setLastMessage(evt.data);
      
      try {
        const data = JSON.parse(evt.data);
        console.log('📊 Parsed WebSocket data:', data);
        
        // Handle different message formats
        if (data.message && data.message.includes('Connected')) {
          return; // Ignore connection messages
        }
        
        // If we get alert data through WebSocket, refresh the data
        if (data.product || data.alerts) {
          fetchInitialAlerts(); // Refresh data when new alerts come in
        }
        
      } catch (e) {
        console.error('❌ Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (e) => {
      console.error('💥 WebSocket error:', e);
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      setConnectionStatus('disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  // Poll /alerts as a fallback in case WebSocket messages are missed
  useEffect(() => {
    const interval = setInterval(() => {
      fetchInitialAlerts();
    }, 5000); // every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const refreshAlerts = async () => {
    await fetchInitialAlerts();
  };

  const getSeverityColor = (zScore) => {
    if (!zScore) return '#666';
    if (zScore >= 5) return '#e74c3c';
    if (zScore >= 3) return '#f39c12';
    return '#27ae60';
  };

  const getTrendingBadge = (zScore, trend) => {
    if (trend === 'up') return '📈 TRENDING UP';
    if (trend === 'down') return '📉 DECLINING';
    if (zScore >= 5) return '🔥 HOT TREND';
    if (zScore >= 3) return '📈 TRENDING';
    return '👀 WARMING UP';
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Prepare data for charts
  const barChartData = items.map(item => ({
    name: item.product_name.length > 12 ? `${item.product_name.substring(0, 10)}...` : item.product_name,
    views: item.current_count,
    zScore: item.z_score,
    baseline: item.mean,
    fullName: item.product_name
  }));

  const lineChartData = items.length > 0 ? items[0].history.map((point, index) => {
    const dataPoint = { time: formatTimestamp(point.timestamp) };
    items.forEach((item, itemIndex) => {
      if (itemIndex < 3) { // Show only top 3 products in line chart
        dataPoint[item.product_name] = item.history[index]?.count || 0;
      }
    });
    return dataPoint;
  }) : [];

  const pieChartData = items.map((item, index) => ({
    name: item.product_name,
    value: item.current_count,
    color: getSeverityColor(item.z_score)
  }));

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="trending-dashboard">
      {/* Debug Info Bar */}
      <div className="debug-bar">
        <div className="connection-status">
          <span className="status-label">Status:</span>
          <span className={`status-indicator ${connectionStatus}`}>
            {connectionStatus.toUpperCase()}
          </span>
        </div>
        <div className="message-count">
          Active Trends: <strong>{items.length}</strong>
        </div>
        <button className="refresh-button" onClick={refreshAlerts}>
          🔄 Refresh Data
        </button>
        <div className="last-update">
          Last Update: {lastMessage ? formatTimestamp(new Date()) : 'Never'}
        </div>
      </div>

      {/* Main Dashboard */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>🔥 Herd Alerter — Trending Now</h1>
          <div className="active-count">
            {items.length} active trend{items.length !== 1 ? 's' : ''} detected
          </div>
        </div>
        
        <div className="header-controls">
          <select 
            value={selectedView} 
            onChange={(e) => setSelectedView(e.target.value)}
            className="view-selector"
          >
            <option value="cards">📋 Cards View</option>
            <option value="bar">📊 Bar Chart</option>
            <option value="line">📈 Line Chart</option>
            <option value="area">🔍 Area Chart</option>
            <option value="pie">🥧 Pie Chart</option>
          </select>
        </div>
      </div>

      {/* Cards View */}
      {selectedView === 'cards' && (
        <div className="view-container">
          <h2>📋 Trending Products</h2>
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>No trending items detected yet</h3>
              <p>When herd behavior is detected, trending products will appear here in real-time.</p>
              <button className="test-button" onClick={refreshAlerts}>
                🔄 Check for Data
              </button>
            </div>
          ) : (
            <div className="trending-grid">
              {items.map((item, index) => (
                <div key={item.id} className="trending-card">
                  <div className="card-header">
                    <div className="rank-badge">#{index + 1}</div>
                    <div 
                      className="trend-indicator"
                      style={{ backgroundColor: getSeverityColor(item.z_score) }}
                    >
                      {getTrendingBadge(item.z_score, item.trend)}
                    </div>
                  </div>
                  
                  <div className="product-info">
                    <h3 className="product-name">{item.product_name}</h3>
                    <div className="product-stats">
                      <div className="stat">
                        <span className="stat-label">Total Views:</span>
                        <span className="stat-value">{item.current_count.toLocaleString()}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Trend:</span>
                        <span className="stat-value" style={{ 
                          color: item.trend === 'up' ? '#27ae60' : item.trend === 'down' ? '#e74c3c' : '#666' 
                        }}>
                          {item.trend?.toUpperCase() || 'STABLE'}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Z-Score:</span>
                        <span 
                          className="stat-value" 
                          style={{ color: getSeverityColor(item.z_score) }}
                        >
                          {item.z_score ? item.z_score.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Baseline:</span>
                        <span className="stat-value">{item.mean}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mini Chart */}
                  <div className="mini-chart">
                    <div className="chart-title">Views Over Time</div>
                    <ResponsiveContainer width="100%" height={60}>
                      <LineChart data={item.history}>
                        <Line 
                          type="monotone" 
                          dataKey="count" 
                          stroke={getSeverityColor(item.z_score)}
                          strokeWidth={2}
                          dot={false}
                        />
                        <Tooltip />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card-footer">
                    <div className="timestamp">
                      ⏰ Updated: {formatTimestamp(item.updated_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bar Chart View */}
      {selectedView === 'bar' && (
        <div className="view-container">
          <h2>📊 Views Comparison</h2>
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📈</div>
              <h3>No data available for chart</h3>
              <p>Generate some events to see the bar chart visualization.</p>
            </div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="views" fill="#8884d8" name="Current Views" />
                  <Bar dataKey="baseline" fill="#82ca9d" name="Baseline Average" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Line Chart View */}
      {selectedView === 'line' && (
        <div className="view-container">
          <h2>📈 Trend Evolution</h2>
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📈</div>
              <h3>No data available for chart</h3>
              <p>Generate some events to see the line chart visualization.</p>
            </div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {items.slice(0, 3).map((item, index) => (
                    <Line 
                      key={item.id}
                      type="monotone"
                      dataKey={item.product_name}
                      stroke={getSeverityColor(item.z_score)}
                      name={`${item.product_name} (${item.current_count} views)`}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Pie Chart View */}
      {selectedView === 'pie' && (
        <div className="view-container">
          <h2>🥧 Market Share Distribution</h2>
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>No data available for chart</h3>
              <p>Generate some events to see the pie chart visualization.</p>
            </div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={150}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Area Chart View */}
      {selectedView === 'area' && (
        <div className="view-container">
          <h2>🔍 Views vs Baseline</h2>
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📈</div>
              <h3>No data available for chart</h3>
              <p>Generate some events to see the area chart visualization.</p>
            </div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="views" 
                    stackId="1"
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    name="Current Views"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="baseline" 
                    stackId="2"
                    stroke="#82ca9d" 
                    fill="#82ca9d" 
                    name="Baseline Average"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}