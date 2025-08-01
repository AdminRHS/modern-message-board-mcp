#!/usr/bin/env node
/**
 * Message Management System - Node.js Server
 * Serves static files and provides an endpoint to update data
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Import database storage (use dynamic import for ES modules)
let storage = null;

async function initializeStorage() {
    try {
        const storageModule = require('./server/storage.js');
        storage = storageModule.storage;
        console.log('Database storage initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database storage:', error);
        console.log('Falling back to file-based storage');
        storage = null;
    }
}

class MessageManagementServer {
    constructor() {
        this.mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon',
            '.svg': 'image/svg+xml'
        };
    }

    /**
     * Add CORS headers to response
     */
    addCorsHeaders(res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    /**
     * Handle OPTIONS preflight requests
     */
    handleOptions(req, res) {
        this.addCorsHeaders(res);
        res.writeHead(200);
        res.end();
    }

    /**
     * Handle POST requests
     */
    handlePost(req, res) {
        const parsedUrl = url.parse(req.url);
        
        if (parsedUrl.pathname === '/api/save-data') {
            this.handleSaveData(req, res);
        } else {
            this.send404(res);
        }
    }

    /**
     * Handle data saving endpoint
     */
    handleSaveData(req, res) {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                if (!body) {
                    this.sendError(res, 400, 'No data provided');
                    return;
                }
                
                // Parse JSON data
                let data;
                try {
                    data = JSON.parse(body);
                } catch (parseError) {
                    this.sendError(res, 400, `Invalid JSON: ${parseError.message}`);
                    return;
                }
                
                // Validate data structure
                if (typeof data !== 'object' || data === null) {
                    this.sendError(res, 400, 'Data must be a JSON object');
                    return;
                }
                
                // Save to database if available, otherwise fall back to file
                if (storage) {
                    try {
                        await storage.saveData(data);
                        console.log(`Data saved to database at ${new Date().toLocaleString()}`);
                    } catch (dbError) {
                        console.error('Database save failed, falling back to file:', dbError);
                        // Fall back to file storage
                        const jsonString = JSON.stringify(data, null, 4);
                        fs.writeFileSync('data.json', jsonString, 'utf8');
                        console.log(`Data saved to data.json at ${new Date().toLocaleString()}`);
                    }
                } else {
                    // Fall back to file storage
                    const jsonString = JSON.stringify(data, null, 4);
                    fs.writeFileSync('data.json', jsonString, 'utf8');
                    console.log(`Data saved to data.json at ${new Date().toLocaleString()}`);
                }
                
                // Send success response
                this.addCorsHeaders(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const response = JSON.stringify({ 
                    success: true, 
                    message: 'Data saved successfully' 
                });
                res.end(response);
                
            } catch (error) {
                console.error('Error saving data:', error);
                this.sendError(res, 500, `Internal server error: ${error.message}`);
            }
        });
        
        req.on('error', (error) => {
            console.error('Request error:', error);
            this.sendError(res, 400, 'Bad request');
        });
    }

    /**
     * Handle GET requests for static files and API endpoints
     */
    handleGet(req, res) {
        const parsedUrl = url.parse(req.url);
        let pathname = parsedUrl.pathname;
        
        // Health check endpoint
        if (pathname === '/health') {
            this.addCorsHeaders(res);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
            return;
        }
        
        // Data endpoint - serve from database or fallback to file
        if (pathname === '/data.json') {
            this.handleGetData(req, res);
            return;
        }
        
        // Default to index.html for root path
        if (pathname === '/') {
            pathname = '/index.html';
        }
        
        // Remove leading slash and resolve file path
        const filePath = path.join(process.cwd(), pathname.substring(1));
        
        // Check if file exists
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                this.send404(res);
                return;
            }
            
            // Get file extension and mime type
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = this.mimeTypes[ext] || 'application/octet-stream';
            
            // Read and serve file
            fs.readFile(filePath, (readErr, data) => {
                if (readErr) {
                    this.sendError(res, 500, 'Error reading file');
                    return;
                }
                
                this.addCorsHeaders(res);
                res.writeHead(200, { 'Content-Type': mimeType });
                res.end(data);
            });
        });
    }

    /**
     * Handle data retrieval endpoint
     */
    async handleGetData(req, res) {
        try {
            let data;
            
            if (storage) {
                try {
                    data = await storage.getData();
                    console.log('Data loaded from database');
                } catch (dbError) {
                    console.error('Database load failed, falling back to file:', dbError);
                    // Fall back to file
                    data = this.loadDataFromFile();
                }
            } else {
                // Fall back to file
                data = this.loadDataFromFile();
            }
            
            this.addCorsHeaders(res);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.sendError(res, 500, 'Error loading data');
        }
    }

    /**
     * Load data from file (fallback method)
     */
    loadDataFromFile() {
        try {
            const dataPath = path.join(process.cwd(), 'data.json');
            if (fs.existsSync(dataPath)) {
                const fileContent = fs.readFileSync(dataPath, 'utf8');
                return JSON.parse(fileContent);
            } else {
                console.log('data.json not found, returning default structure');
                return this.getDefaultData();
            }
        } catch (error) {
            console.error('Error reading data.json:', error);
            return this.getDefaultData();
        }
    }

    /**
     * Get default data structure
     */
    getDefaultData() {
        return {
            tabs: {
                "emergency": { name: "Emergency", messages: [] },
                "requests": { name: "Requests", messages: [] },
                "updates": { name: "Updates", messages: [] },
                "confirmations": { name: "Confirmations", messages: [] },
                "follow-ups": { name: "Follow-ups", messages: [] },
                "closures": { name: "Closures", messages: [] },
                "escalations": { name: "Escalations", messages: [] },
                "notifications": { name: "Notifications", messages: [] },
                "reports": { name: "Reports", messages: [] },
                "reminders": { name: "Reminders", messages: [] }
            },
            lastSaved: new Date().toLocaleString()
        };
    }

    /**
     * Handle HEAD requests for health checks
     */
    handleHead(req, res) {
        const parsedUrl = url.parse(req.url);
        let pathname = parsedUrl.pathname;
        
        // Health check endpoint
        if (pathname === '/health') {
            this.addCorsHeaders(res);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end();
            return;
        }
        
        // Default to index.html for root path
        if (pathname === '/') {
            pathname = '/index.html';
        }
        
        // Remove leading slash and resolve file path
        const filePath = path.join(process.cwd(), pathname.substring(1));
        
        // Check if file exists
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                this.send404(res);
                return;
            }
            
            // Get file extension and mime type
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = this.mimeTypes[ext] || 'application/octet-stream';
            
            // Return headers only, no body
            this.addCorsHeaders(res);
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end();
        });
    }

    /**
     * Send 404 error
     */
    send404(res) {
        this.addCorsHeaders(res);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
    }

    /**
     * Send error response
     */
    sendError(res, statusCode, message) {
        this.addCorsHeaders(res);
        res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
        res.end(message);
    }

    /**
     * Main request handler
     */
    handleRequest(req, res) {
        const method = req.method.toUpperCase();
        
        console.log(`${new Date().toISOString()} - ${method} ${req.url}`);
        
        switch (method) {
            case 'OPTIONS':
                this.handleOptions(req, res);
                break;
            case 'POST':
                this.handlePost(req, res);
                break;
            case 'GET':
                this.handleGet(req, res);
                break;
            case 'HEAD':
                this.handleHead(req, res);
                break;
            default:
                this.sendError(res, 405, 'Method not allowed');
                break;
        }
    }

    /**
     * Start the server
     */
    async start(port = 5000) {
        // Initialize database storage
        await initializeStorage();
        
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.log(`Port ${port} is already in use. Trying port ${port + 1}`);
                this.start(port + 1);
            } else {
                console.error('Server error:', error);
                process.exit(1);
            }
        });

        server.listen(port, '0.0.0.0', () => {
            console.log(`Message Management Server running on http://0.0.0.0:${port}`);
            console.log('Features:');
            console.log('- Static file serving');
            console.log('- Data.json save endpoint: POST /api/save-data');
            console.log('- CORS enabled for frontend integration');
            console.log('\nPress Ctrl+C to stop the server');
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nServer stopped by user');
            server.close(() => {
                process.exit(0);
            });
        });

        process.on('SIGTERM', () => {
            console.log('\nServer terminated');
            server.close(() => {
                process.exit(0);
            });
        });
    }
}

// Main execution
if (require.main === module) {
    const port = parseInt(process.env.PORT) || 5000;
    const server = new MessageManagementServer();
    server.start(port).catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = MessageManagementServer;