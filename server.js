const express = require('express');
const path = require('path');
const net = require('net');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const dns = require('dns');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active SSE clients
const clients = new Set();

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Add this client to our set
  clients.add(res);
  
  // Remove client when they disconnect
  req.on('close', () => {
    clients.delete(res);
  });
});

// Function to send SSE to all clients
function sendSSE(data) {
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Function to get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  Object.keys(interfaces).forEach((interfaceName) => {
    interfaces[interfaceName].forEach((interface) => {
      if (interface.family === 'IPv4' && !interface.internal) {
        addresses.push({
          interface: interfaceName,
          ip: interface.address,
          netmask: interface.netmask
        });
      }
    });
  });
  
  return addresses;
}

// Function to get ARP table
async function getARPTable() {
  try {
    const { stdout } = await execAsync('arp -a');
    const lines = stdout.split('\n');
    const devices = [];
    
    for (const line of lines) {
      // Match IP addresses and MAC addresses
      const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      const macMatch = line.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
      
      if (ipMatch && macMatch) {
        const ip = ipMatch[1];
        const mac = macMatch[0];
        
        // Skip broadcast and multicast addresses
        if (!ip.endsWith('.255') && !ip.startsWith('224.')) {
          devices.push({
            ip,
            mac
          });
        }
      }
    }
    
    return devices;
  } catch (error) {
    console.error('Error getting ARP table:', error);
    return [];
  }
}

// Function to check if a port is open
async function checkPort(ip, port, timeout = 100) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.setNoDelay(true); // Disable Nagle's algorithm for faster connections
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    try {
      socket.connect(port, ip);
    } catch (err) {
      socket.destroy();
      resolve(false);
    }
  });
}

// Function to scan a batch of IPs in parallel
async function scanIPBatch(ips, ports) {
  const results = await Promise.all(
    ips.map(async (ip) => {
      try {
        // Try port 9026 first (most common PS5 port)
        const isPS5 = await checkPort(ip, 9026);
        if (isPS5) {
          // If 9026 is open, check 9021 quickly
          const has9021 = await checkPort(ip, 9021);
          return {
            ip,
            ports: has9021 ? [9026, 9021] : [9026]
          };
        }
      } catch (err) {
        // Ignore errors for speed
      }
      return null;
    })
  );
  
  return results.filter(result => result !== null);
}

// Function to scan network for PS5 devices
async function scanNetwork(interfaceName) {
  const activeHosts = [];
  const localIPs = getLocalIPs();
  
  if (localIPs.length === 0) {
    console.error('No network interfaces found');
    return activeHosts;
  }

  // Filter local IPs to find the correct network interface
  let targetIP = null;
  if (interfaceName) {
    // If interface name is specified, use that
    targetIP = localIPs.find(ip => ip.interface === interfaceName);
  } else {
    // Otherwise, prioritize non-link-local addresses (not 169.254.x.x)
    targetIP = localIPs.find(ip => !ip.ip.startsWith('169.254.'));
    if (!targetIP) {
      // If no non-link-local address found, use the first one
      targetIP = localIPs[0];
    }
  }

  if (!targetIP) {
    console.error('No suitable network interface found');
    return activeHosts;
  }

  // Get the local network prefix (first three octets)
  const ipParts = targetIP.ip.split('.');
  const networkPrefix = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
  
  console.log(`Scanning network ${networkPrefix}.x for PS5 devices on interface ${targetIP.interface}...`);
  
  // Create array of IPs to scan (excluding our own IP)
  const ipsToScan = [];
  for (let i = 1; i < 255; i++) {
    const ip = `${networkPrefix}.${i}`;
    if (ip !== targetIP.ip) {
      ipsToScan.push(ip);
    }
  }
  
  // Scan in larger batches for more parallelism
  const batchSize = 50;
  for (let i = 0; i < ipsToScan.length; i += batchSize) {
    const batch = ipsToScan.slice(i, i + batchSize);
    const batchResults = await scanIPBatch(batch);
    activeHosts.push(...batchResults);
  }
  
  console.log(`Scan complete. Found ${activeHosts.length} PS5 on network ${networkPrefix}.x`);
  return activeHosts;
}

// Add new endpoint to get available IPs
app.get('/scan-network', async (req, res) => {
  try {
    const localIPs = getLocalIPs();
    console.log('Local IPs found:', localIPs);
    
    if (localIPs.length === 0) {
      return res.status(500).json({ error: 'No network interfaces found' });
    }
    
    const activeHosts = await scanNetwork();
    
    res.json({
      localIPs,
      activeHosts
    });
  } catch (error) {
    console.error('Network scan error:', error);
    res.status(500).json({ error: 'Failed to scan network' });
  }
});

// Handle file uploads and sending to target device
app.post('/send-lua', upload.single('file'), (req, res) => {
  console.log('Received request to /send-lua');
  console.log('Request body:', req.body);
  console.log('Request file:', req.file);

  // Check if we have all required fields
  if (!req.body.ipAddress || !req.body.port) {
    console.error('Missing required fields:', { 
      ipAddress: req.body.ipAddress, 
      port: req.body.port 
    });
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields (IP address or port)',
      logs: ['Missing required fields (IP address or port)']
    });
  }

  const ipAddress = req.body.ipAddress;
  const port = parseInt(req.body.port, 10);
  let fileName;
  let filePath;

  // Determine file source (uploaded or predefined)
  if (req.file) {
    // Using uploaded file
    fileName = req.file.originalname;
    filePath = req.file.path;
  } else if (req.body.fileName) {
    // Using predefined file
    fileName = req.body.fileName;
    filePath = path.join(__dirname, 'payloads', fileName);
    
    // Verify predefined file exists
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ 
        success: false, 
        error: `Predefined file ${fileName} not found`,
        logs: [`Predefined file ${fileName} not found`]
      });
    }
  } else {
    return res.status(400).json({ 
      success: false, 
      error: 'No file specified (neither uploaded nor predefined)',
      logs: ['No file specified (neither uploaded nor predefined)']
    });
  }
  
  // Initialize logs array to capture all events
  const logs = [];
  logs.push(`Starting process for file: ${fileName}`);
  logs.push(`Target: ${ipAddress}:${port}`);

  // Send initial status via SSE
  sendSSE({ type: 'status', message: `Starting process for file: ${fileName}` });

  console.log(`Sending ${fileName} to ${ipAddress}:${port}`);

  // Read the file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      logs.push(`Error reading file: ${err.message}`);
      sendSSE({ type: 'error', message: `Error reading file: ${err.message}` });
      return res.status(500).json({ 
        success: false, 
        error: 'Error reading file',
        logs 
      });
    }

    logs.push(`File read successfully, content size: ${data.length} bytes`);
    sendSSE({ type: 'status', message: `File read successfully, content size: ${data.length} bytes` });

    logs.push(`Attempting to connect to ${ipAddress}:${port}...`);
    sendSSE({ type: 'status', message: `Attempting to connect to ${ipAddress}:${port}...` });

    // Create a TCP client and connect to the target device
    const client = new net.Socket();
    let responseData = '';
    
    // Set a timeout for the connection
    client.setTimeout(30000); // 30 seconds
    logs.push('Connection timeout set to 30000ms');
    sendSSE({ type: 'status', message: 'Connection timeout set to 30000ms' });
    
    // Handle connection errors
    client.on('error', (err) => {
      console.error('Connection error:', err);
      logs.push(`Connection error: ${err.message}`);
      logs.push(`Error code: ${err.code}`);
      logs.push(`Error stack: ${err.stack}`);
      sendSSE({ type: 'error', message: `Connection error: ${err.message}` });
      if (req.file) {
        // Clean up the uploaded file
        fs.unlink(filePath, () => {
          logs.push('Temporary file deleted');
        });
      }
      if (!res.headersSent) {
        return res.status(500).json({ 
          success: false, 
          error: err.message,
          logs 
        });
      }
    });
    
    // Handle connection timeout
    client.on('timeout', () => {
      // Check if this is the second file (elf_loader.lua)
      const isSecondFile = fileName.toLowerCase() === 'elf_loader.lua';
      
      if (isSecondFile) {
        console.log('Connection timed out - PS5 exploit successful (kernel panic triggered)');
        logs.push('Connection timed out - PS5 exploit successful (kernel panic triggered)');
        logs.push('This is expected behavior for elf_loader.lua');
        sendSSE({ type: 'success', message: 'PS5 exploit successful - kernel panic triggered' });
      } else {
        console.log('Connection timed out - waiting for kernel panic');
        logs.push('Connection timed out - waiting for kernel panic');
        sendSSE({ type: 'status', message: 'Connection timed out - waiting for kernel panic' });
      }
      
      logs.push('Current connection state:', client.readyState);
      client.destroy();
      
      if (req.file) {
        // Clean up the uploaded file
        fs.unlink(filePath, () => {
          logs.push('Temporary file deleted');
        });
      }
      
      if (!res.headersSent) {
        return res.json({ 
          success: true, 
          response: isSecondFile 
            ? 'PS5 exploit completed - kernel panic triggered successfully' 
            : 'First file sent - waiting for kernel panic',
          logs 
        });
      }
    });
    
    // Log raw buffer data as hex
    function logBuffer(buffer, prefix) {
      const hexData = buffer.toString('hex').match(/.{1,2}/g).join(' ');
      const truncatedHex = hexData.length > 100 
        ? hexData.substring(0, 100) + '...' 
        : hexData;
      logs.push(`${prefix} [HEX]: ${truncatedHex}`);
      
      // Try to log as string if it's printable
      const strData = buffer.toString().replace(/[^\x20-\x7E]/g, '.');
      const truncatedStr = strData.length > 100 
        ? strData.substring(0, 100) + '...' 
        : strData;
      logs.push(`${prefix} [ASCII]: ${truncatedStr}`);
    }
    
    // Handle data received from the device
    client.on('data', (chunk) => {
      responseData += chunk.toString();
      console.log('Received data from device:', chunk.toString());
      logs.push(`Received data from device (${chunk.length} bytes)`);
      logBuffer(chunk, 'RECEIVED');
      
      // Send real-time data via SSE
      sendSSE({ 
        type: 'data', 
        message: chunk.toString(),
        hex: chunk.toString('hex'),
        length: chunk.length
      });
    });
    
    // Handle connection close
    client.on('close', () => {
      console.log('Connection closed');
      logs.push('Connection closed');
      sendSSE({ type: 'status', message: 'Connection closed' });
      
      if (req.file) {
        // Clean up the uploaded file
        fs.unlink(filePath, () => {
          logs.push('Temporary file deleted');
        });
      }
      
      // Only send response if it hasn't been sent yet
      if (!res.headersSent) {
        res.json({ 
          success: true, 
          response: responseData,
          logs 
        });
      }
    });
    
    // Connect to the target device
    client.connect(port, ipAddress, () => {
      console.log('Connected to device');
      logs.push(`Successfully connected to ${ipAddress}:${port}`);
      sendSSE({ type: 'status', message: `Successfully connected to ${ipAddress}:${port}` });
      
      // Get the raw file data
      const fileSize = data.length;
      logs.push(`File size: ${fileSize} bytes`);
      sendSSE({ type: 'status', message: `File size: ${fileSize} bytes` });
      
      // For ELF files, send the raw data directly
      if (fileName.endsWith('.elf') || fileName.endsWith('.bin')) {
        logs.push('Sending binary file data directly...');
        sendSSE({ type: 'status', message: 'Sending binary file data directly...' });
        
        client.write(data, (err) => {
          if (err) {
            console.error('Error sending file data:', err);
            logs.push(`Error sending file data: ${err.message}`);
            sendSSE({ type: 'error', message: `Error sending file data: ${err.message}` });
            client.destroy();
            return res.status(500).json({ 
              success: false, 
              error: err.message,
              logs 
            });
          }
          
          console.log('Binary file sent successfully');
          logs.push(`Binary file sent successfully (${data.length} bytes)`);
          sendSSE({ type: 'status', message: `Binary file sent successfully (${data.length} bytes)` });
          
          // For binary files, we can close the connection after sending
          client.end();
        });
      } else {
        // For Lua files, send size header first
        const sizeBuffer = Buffer.alloc(8);
        sizeBuffer.writeUInt32LE(fileSize, 0);
        sizeBuffer.writeUInt32LE(0, 4); // High 32 bits are 0
        
        logs.push(`Size header (8 bytes, little-endian): ${sizeBuffer.toString('hex')}`);
        sendSSE({ type: 'status', message: `Size header: ${sizeBuffer.toString('hex')}` });
        
        // Send the size header first
        client.write(sizeBuffer, (err) => {
          if (err) {
            console.error('Error sending size header:', err);
            logs.push(`Error sending size header: ${err.message}`);
            sendSSE({ type: 'error', message: `Error sending size header: ${err.message}` });
            client.destroy();
            return res.status(500).json({ 
              success: false, 
              error: err.message,
              logs 
            });
          }
          
          logs.push('Size header sent successfully');
          sendSSE({ type: 'status', message: 'Size header sent successfully' });
          
          // Add a small delay before sending file data
          setTimeout(() => {
            // Then send the file data
            client.write(data, (err) => {
              if (err) {
                console.error('Error sending file data:', err);
                logs.push(`Error sending file data: ${err.message}`);
                sendSSE({ type: 'error', message: `Error sending file data: ${err.message}` });
                client.destroy();
                return res.status(500).json({ 
                  success: false, 
                  error: err.message,
                  logs 
                });
              }
              
              console.log('Data sent successfully');
              logs.push(`File data sent successfully (${data.length} bytes)`);
              sendSSE({ type: 'status', message: `File data sent successfully (${data.length} bytes)` });
              
              // For PS5 exploit, we want to keep the connection open
              // and let the device handle the kernel panic
              logs.push('Connection kept open for PS5 exploit');
              sendSSE({ type: 'status', message: 'Connection kept open for PS5 exploit' });
              
              // If this is umtx.lua, we expect a response
              if (fileName.toLowerCase() === 'umtx.lua') {
                logs.push('Waiting for response from umtx.lua...');
                sendSSE({ type: 'status', message: 'Waiting for response from umtx.lua...' });
              } else if (fileName.toLowerCase() === 'elf_loader.lua') {
                logs.push('Kernel panic should be triggered now');
                sendSSE({ type: 'status', message: 'Kernel panic should be triggered now' });
              }
            });
          }, 100); // 100ms delay between size header and file data
        });
      }
    });
  });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Send Lua endpoint at http://localhost:${PORT}/send-lua`);
});