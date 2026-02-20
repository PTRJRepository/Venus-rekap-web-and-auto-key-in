import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { AutomationEngine } from './engine/Engine';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

const engine = new AutomationEngine();
const TEMPLATES_DIR = resolve(__dirname, '../../templates');

io.on('connection', (socket) => {
  console.log('🔌 Client connected');

  engine.setCallbacks(
    (msg, level, nodeId) => socket.emit('execution:log', { message: msg, level, nodeId }),
    (nodeId, status) => socket.emit('execution:step', { nodeId, status }),
    (status) => socket.emit('execution:complete', { status }),
    (event) => socket.emit('recording:event', event)
  );

  socket.on('run', (flowData) => {
    console.log('▶️ Running flow:', flowData.name);
    console.log('📦 Flow payload summary:');
    console.log(` - Nodes: ${flowData.nodes?.length || 0}`);
    console.log(` - Edges: ${flowData.edges?.length || 0}`);
    console.log(` - DataFile: ${flowData.dataFile || 'none'}`);

    // Check if start node exists
    const hasStart = flowData.nodes?.some((n: any) => n.data?.actionType === 'start');
    console.log(` - Has start node: ${hasStart}`);

    engine.runFlow(flowData);
  });

  socket.on('stop', async () => {
    console.log('⏹️ Stop requested');
    await engine.requestStop();
  });

  socket.on('record:start', ({ url }: { url: string }) => {
    console.log('🔴 Recording started:', url);
    engine.startRecording(url);
  });

  socket.on('record:stop', () => {
    console.log('⏹️ Recording stopped');
    engine.stopRecording();
  });

  socket.on('disconnect', () => console.log('🔌 Disconnected'));
});

// API
app.get('/api/actions', (req, res) => {
  res.json({ actions: engine.getRegisteredActions() });
});

app.post('/api/run', (req, res) => {
  engine.runFlow(req.body);
  res.json({ status: 'started' });
});

app.post('/api/stop', async (req, res) => {
  await engine.requestStop();
  res.json({ status: 'stopping' });
});

// Recording APIs
app.post('/api/record/start', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  engine.startRecording(url);
  res.json({ status: 'recording_started' });
});

app.post('/api/record/stop', (req, res) => {
  engine.stopRecording();
  res.json({ status: 'recording_stopped' });
});

// Template APIs
app.get('/api/templates', (req, res) => {
  try {
    if (!existsSync(TEMPLATES_DIR)) {
      return res.json({ templates: [] });
    }

    const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.flow.json'));
    const templates = files.map(f => {
      const content = JSON.parse(readFileSync(join(TEMPLATES_DIR, f), 'utf-8'));
      return {
        filename: f,
        id: content.id || f.replace('.flow.json', ''),
        name: content.name || f,
        description: content.description || '',
        tags: content.metadata?.tags || [],
        nodeCount: content.nodes?.length || 0,
      };
    });
    res.json({ templates });
  } catch (e: any) {
    console.error('Error loading templates:', e.message);
    res.json({ templates: [], error: e.message });
  }
});

app.get('/api/templates/:name', (req, res) => {
  try {
    let filename = req.params.name;
    if (!filename.endsWith('.flow.json')) filename += '.flow.json';
    const filepath = join(TEMPLATES_DIR, filename);

    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const content = JSON.parse(readFileSync(filepath, 'utf-8'));
    res.json(content);
  } catch (e: any) {
    res.status(404).json({ error: `Template not found: ${e.message}` });
  }
});

// Save/Update template - allows updating imported templates
app.post('/api/templates/:name', (req, res) => {
  try {
    let filename = req.params.name;
    if (!filename.endsWith('.flow.json')) filename += '.flow.json';
    const filepath = join(TEMPLATES_DIR, filename);

    // Validate request body
    if (!req.body || !req.body.nodes) {
      return res.status(400).json({ error: 'Invalid template data - nodes array required' });
    }

    // Ensure template has required fields
    const templateData = {
      ...req.body,
      filename: filename,
      updatedAt: new Date().toISOString(),
    };

    // Add ID if not present
    if (!templateData.id) {
      templateData.id = filename.replace('.flow.json', '');
    }

    // Write to file
    writeFileSync(filepath, JSON.stringify(templateData, null, 2), 'utf-8');

    res.json({
      success: true,
      message: `Template saved: ${filename}`,
      filename: filename,
      path: filepath
    });
  } catch (e: any) {
    console.error('Error saving template:', e.message);
    res.status(500).json({ error: `Failed to save template: ${e.message}` });
  }
});

const PORT = 5001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Templates directory: ${TEMPLATES_DIR}`);
});
