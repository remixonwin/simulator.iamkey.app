import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const execAsync = promisify(exec);
const ADB_PATH = 'adb'; // Since it's in path, otherwise use full path found: /usr/lib/android-sdk/platform-tools/adb

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Backend server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/welcome', (req: Request, res: Response) => {
  res.json({
    title: 'Antigravity Welcome',
    message: 'Connected to Node.js Backend Successfully!',
    features: ['Wireless ADB Debug', 'Real-time Sync', 'Secure Auth']
  });
});

app.post('/api/adb/connect', async (req: Request, res: Response) => {
  const { ipAddress } = req.body;

  if (!ipAddress || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}$/.test(ipAddress)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid IP address format. Use 0.0.0.0:00000'
    });
  }

  try {
    console.log(`[adb]: Running command: ${ADB_PATH} connect ${ipAddress}`);
    const result = await execAsync(`${ADB_PATH} connect ${ipAddress}`).catch(err => err);
    
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combinedOutput = (stdout + stderr).toLowerCase();

    console.log(`[adb]: Result - stdout: ${stdout}, stderr: ${stderr}`);

    if (combinedOutput.includes('already connected') || combinedOutput.includes('connected to')) {
      res.json({
        success: true,
        message: stdout.trim() || 'Connected successfully',
        details: stdout
      });
    } else {
      res.status(400).json({
        success: false,
        message: stdout.trim() || stderr.trim() || 'Failed to connect',
        details: combinedOutput
      });
    }
  } catch (error: any) {
    console.error(`[adb]: Critical error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'ADB internal server error',
      details: error.message
    });
  }
});

app.get('/api/adb/apps', async (req: Request, res: Response) => {
  const { ipAddress } = req.query;

  if (!ipAddress) {
    return res.status(400).json({ success: false, message: 'IP address required' });
  }

  try {
    // Get list of 3rd party packages
    const { stdout } = await execAsync(`${ADB_PATH} -s ${ipAddress} shell pm list packages -3`);
    const packages = stdout
      .split('\n')
      .map(line => line.replace('package:', '').trim())
      .filter(line => line.length > 0);

    res.json({ success: true, packages });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch apps', details: error.message });
  }
});

app.get('/api/adb/pid', async (req: Request, res: Response) => {
  const { ipAddress, packageName } = req.query;

  try {
    const { stdout } = await execAsync(`${ADB_PATH} -s ${ipAddress} shell pidof ${packageName}`);
    res.json({ success: true, pid: stdout.trim() });
  } catch (error: any) {
    res.json({ success: true, pid: null }); // Process might not be running
  }
});

// HTTP server for WebSocket integration
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/logs' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws]: Client connected for logs');
  
  let logcatProcess: any = null;

  ws.on('message', (message: string) => {
    const data = JSON.parse(message.toString());
    
    if (data.action === 'start_logs') {
      if (logcatProcess) logcatProcess.kill();
      
      const args = ['-s', data.ipAddress, 'logcat', '-v', 'time'];
      if (data.pid) {
        args.push('--pid', data.pid);
      }
      
      console.log(`[adb]: Starting logcat for ${data.ipAddress} (PID: ${data.pid || 'all'})`);
      logcatProcess = spawn(ADB_PATH, args);

      logcatProcess.stdout.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'log', data: data.toString() }));
        }
      });

      logcatProcess.stderr.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', data: data.toString() }));
        }
      });
    }

    if (data.action === 'stop_logs') {
      if (logcatProcess) {
        logcatProcess.kill();
        logcatProcess = null;
      }
    }
  });

  ws.on('close', () => {
    if (logcatProcess) logcatProcess.kill();
    console.log('[ws]: Client disconnected');
  });
});

// Start Server using the http server wrapper
server.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
