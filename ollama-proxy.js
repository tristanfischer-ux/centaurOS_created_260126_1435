#!/usr/bin/env node

const http = require('http');
const https = require('https');

const PROXY_PORT = 8000;
const OLLAMA_URL = 'http://localhost:11434';

// Map Cursor's model names to your Ollama models
const MODEL_MAPPING = {
  'gpt-4': 'qwen2.5:14b-instruct-q4_K_M',
  'gpt-4o': 'qwen2.5:14b-instruct-q4_K_M',
  'gpt-4-turbo': 'qwen2.5:14b-instruct-q4_K_M',
  'gpt-4-turbo-preview': 'qwen2.5:14b-instruct-q4_K_M',
  'gpt-3.5-turbo': 'qwen2.5-coder:7b',
  'gpt-3.5': 'qwen2.5-coder:7b',
  'claude-3-5-sonnet': 'deepseek-coder:6.7b',
  'claude-3.5-sonnet': 'deepseek-coder:6.7b',
  'claude-3-sonnet': 'deepseek-coder:6.7b',
  'claude-3-opus': 'qwen2.5:14b-instruct-q4_K_M',
  'claude-3-haiku': 'qwen2.5-coder:7b'
};

console.log('🚀 Ollama Proxy Server Starting...');
console.log(`📍 Proxy listening on: http://localhost:${PROXY_PORT}`);
console.log(`🔗 Forwarding to Ollama: ${OLLAMA_URL}`);
console.log('');
console.log('📊 Model Mappings:');
Object.entries(MODEL_MAPPING).forEach(([from, to]) => {
  console.log(`   ${from} → ${to}`);
});
console.log('');

// Model IDs we advertise to Cursor (so they appear in the dropdown)
const ADVERTISED_MODELS = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-5-sonnet'];

function sendModelList(res) {
  const data = ADVERTISED_MODELS.map((id, i) => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000) - i,
    owned_by: 'ollama'
  }));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ object: 'list', data }));
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Cursor calls GET /v1/models to populate the dropdown. Ollama has no /v1/models, so we respond here.
  if (req.method === 'GET' && (req.url === '/v1/models' || req.url.startsWith('/v1/models?'))) {
    console.log('📋 Cursor requested model list → returning gpt-4, gpt-3.5-turbo, claude-3-5-sonnet');
    sendModelList(res);
    return;
  }

  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    // Parse request
    let requestData;
    try {
      requestData = body ? JSON.parse(body) : {};
    } catch (e) {
      requestData = {};
    }

    // Map model name if present
    if (requestData.model && MODEL_MAPPING[requestData.model]) {
      const originalModel = requestData.model;
      requestData.model = MODEL_MAPPING[requestData.model];
      console.log(`✅ Mapped: ${originalModel} → ${requestData.model}`);
    }

    // Forward to Ollama
    const ollamaUrl = new URL(req.url, OLLAMA_URL);
    
    const options = {
      hostname: 'localhost',
      port: 11434,
      path: ollamaUrl.pathname + ollamaUrl.search,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(requestData))
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('❌ Proxy error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    });

    if (requestData && Object.keys(requestData).length > 0) {
      proxyReq.write(JSON.stringify(requestData));
    }
    proxyReq.end();
  });
});

server.listen(PROXY_PORT, () => {
  console.log('✅ Proxy server is ready!');
  console.log('');
  console.log('🔧 Now update Cursor settings:');
  console.log(`   Base URL: http://localhost:${PROXY_PORT}/v1`);
  console.log('   API Key: ollama');
  console.log('');
  console.log('💡 Use any model from Cursor\'s dropdown - they\'ll work with your local models!');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down proxy server...');
  server.close();
  process.exit(0);
});
