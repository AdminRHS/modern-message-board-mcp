#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// Hardcoded URL for the message board API
const MESSAGE_BOARD_URL = 'https://modern-message-board-lg.replit.app';

// HTTP headers for API requests
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'User-Agent': 'Modern-Message-Board-MCP/1.0.0'
});

// Tab name mapping
const TAB_NAMES = {
  '1': 'First Messages',
  '2': 'Second Messages',
  '3': 'Third Messages',
  '4': 'Fourth Messages',
  '5': 'Short First',
  '6': 'Not Interested',
  '7': 'Interested',
  '8': 'Affiliate',
  '9': 'Old Connections',
  '10': 'New Task'
};

// API request helper
async function apiRequest(endpoint, options = {}) {
  // Always use /data.json to get all data
  const url = `${MESSAGE_BOARD_URL}/data.json`;
  const requestOptions = {
    headers: getHeaders(),
    ...options
  };

  try {
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const allData = await response.json();
      
      // Handle different endpoints based on the requested path
      if (endpoint === '/api/messages') {
        // Flatten all messages from all numeric tabs
        const messages = [];
        Object.keys(allData).forEach(tabKey => {
          // Skip non-array tabs and lastSaved
          if (Array.isArray(allData[tabKey])) {
            allData[tabKey].forEach((message, idx) => {
              // Create a message object with ID and content
              messages.push({
                id: `tab${tabKey}-msg${idx}`,
                title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
                content: message,
                tabId: tabKey,
                category: TAB_NAMES[tabKey] || `Tab ${tabKey}`
              });
            });
          }
        });
        return { messages };
      }
      else if (endpoint.startsWith('/api/messages/')) {
        // Extract ID from endpoint
        const messageId = endpoint.split('/').pop();
        const [tabId, msgIdx] = messageId.replace('tab', '').split('-msg');
        
        if (allData[tabId] && Array.isArray(allData[tabId]) && allData[tabId][msgIdx]) {
          const message = allData[tabId][msgIdx];
          return {
            id: messageId,
            title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
            content: message,
            tabId: tabId,
            category: TAB_NAMES[tabId] || `Tab ${tabId}`
          };
        } else {
          throw new Error(`Message not found: ${messageId}`);
        }
      }
      else {
        return allData;
      }
    }
    
    return await response.text();
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

// Tool handlers
const handlers = {
  async get_messages(args) {
    try {
      // Get all data
      const allData = await apiRequest('/data.json');
      
      // Filter by category if specified
      let targetTabs = Object.keys(allData).filter(key => 
        key !== "lastSaved" && !isNaN(parseInt(key))
      );
      
      if (args.category) {
        // Find tab key by name
        targetTabs = Object.keys(TAB_NAMES).filter(key => 
          TAB_NAMES[key].toLowerCase() === args.category.toLowerCase()
        );
      }
      
      // Flatten all messages from target tabs
      const messages = [];
      
      targetTabs.forEach(tabKey => {
        if (Array.isArray(allData[tabKey])) {
          allData[tabKey].forEach((message, idx) => {
            messages.push({
              id: `tab${tabKey}-msg${idx}`,
              title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
              content: message,
              tabId: tabKey,
              category: TAB_NAMES[tabKey] || `Tab ${tabKey}`
            });
          });
        }
      });
      
      // Apply pagination if specified
      let result = messages;
      if (args.limit) {
        const limit = parseInt(args.limit);
        const page = parseInt(args.page || 1);
        const start = (page - 1) * limit;
        result = messages.slice(start, start + limit);
      }
      
      return { content: [{ type: 'text', text: JSON.stringify({ messages: result }, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error getting messages: ${error.message}` }], 
        isError: true 
      };
    }
  },

  async get_message(args) {
    try {
      if (!args.messageId) {
        throw new Error('messageId is required');
      }
      
      // Get all data
      const allData = await apiRequest('/data.json');
      
      // Parse the message ID to find tab and index
      const [tabId, msgIdx] = args.messageId.replace('tab', '').split('-msg').map(part => parseInt(part));
      
      if (!tabId || isNaN(msgIdx)) {
        throw new Error(`Invalid message ID format: ${args.messageId}`);
      }
      
      const tabKey = tabId.toString();
      
      // Check if the tab and message exist
      if (!allData[tabKey] || !Array.isArray(allData[tabKey]) || !allData[tabKey][msgIdx]) {
        throw new Error(`Message not found: ${args.messageId}`);
      }
      
      // Get the message
      const message = allData[tabKey][msgIdx];
      
      // Create message object
      const messageData = {
        id: args.messageId,
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        content: message,
        tabId: tabKey,
        category: TAB_NAMES[tabKey] || `Tab ${tabKey}`
      };
      
      return { content: [{ type: 'text', text: JSON.stringify(messageData, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error getting message: ${error.message}` }], 
        isError: true 
      };
    }
  },

  async create_message(args) {
    try {
      if (!args.title || !args.content) {
        throw new Error('title and content are required');
      }

      // First get all existing data
      const allData = await apiRequest('/data.json');
      
      // Determine which tab to add the message to
      let tabKey = '1'; // Default to First Messages
      
      if (args.category) {
        // Look up tab key by name
        Object.keys(TAB_NAMES).forEach(key => {
          if (TAB_NAMES[key].toLowerCase() === args.category.toLowerCase()) {
            tabKey = key;
          }
        });
      }
      
      // Make sure the tab exists as an array
      if (!allData[tabKey]) {
        allData[tabKey] = [];
      } else if (!Array.isArray(allData[tabKey])) {
        // If it's not an array, convert to array with existing content as first item
        const oldContent = allData[tabKey];
        allData[tabKey] = [typeof oldContent === 'string' ? oldContent : JSON.stringify(oldContent)];
      }
      
      // Add new message to the tab array
      allData[tabKey].push(args.content);
      
      // Save updated data back to server
      const saveResponse = await fetch(`${MESSAGE_BOARD_URL}/api/save-data`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(allData)
      });
      
      if (!saveResponse.ok) {
        throw new Error(`Failed to save: HTTP ${saveResponse.status}`);
      }
      
      // Create message data for response
      const messageData = {
        id: `tab${tabKey}-msg${allData[tabKey].length - 1}`,
        title: args.title,
        content: args.content,
        tabId: tabKey,
        category: TAB_NAMES[tabKey] || `Tab ${tabKey}`,
        createdAt: new Date().toISOString()
      };
      
      return { content: [{ type: 'text', text: JSON.stringify(messageData, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error creating message: ${error.message}` }], 
        isError: true 
      };
    }
  },

  async update_message(args) {
    try {
      if (!args.messageId) {
        throw new Error('messageId is required');
      }
      
      // Get all existing data
      const allData = await apiRequest('/data.json');
      
      // Parse the message ID to find tab and index
      const [tabId, msgIdx] = args.messageId.replace('tab', '').split('-msg').map(part => parseInt(part));
      
      if (!tabId || isNaN(msgIdx)) {
        throw new Error(`Invalid message ID format: ${args.messageId}`);
      }
      
      const tabKey = tabId.toString();
      
      // Check if the tab and message exist
      if (!allData[tabKey] || !Array.isArray(allData[tabKey]) || !allData[tabKey][msgIdx]) {
        throw new Error(`Message not found: ${args.messageId}`);
      }
      
      // Update message content if provided
      if (args.content) {
        allData[tabKey][msgIdx] = args.content;
      }
      
      // Handle category change (move to different tab)
      if (args.category) {
        // Find the new tab key
        let newTabKey = tabKey;
        
        Object.keys(TAB_NAMES).forEach(key => {
          if (TAB_NAMES[key].toLowerCase() === args.category.toLowerCase()) {
            newTabKey = key;
          }
        });
        
        // If moving to a different tab
        if (newTabKey !== tabKey) {
          // Get the content to move
          const messageContent = allData[tabKey][msgIdx];
          
          // Remove from current tab
          allData[tabKey].splice(msgIdx, 1);
          
          // Make sure the new tab exists as an array
          if (!allData[newTabKey]) {
            allData[newTabKey] = [];
          } else if (!Array.isArray(allData[newTabKey])) {
            const oldContent = allData[newTabKey];
            allData[newTabKey] = [typeof oldContent === 'string' ? oldContent : JSON.stringify(oldContent)];
          }
          
          // Add to new tab
          allData[newTabKey].push(messageContent);
        }
      }
      
      // Update lastSaved timestamp
      allData.lastSaved = new Date().toLocaleString();
      
      // Save updated data back to server
      const saveResponse = await fetch(`${MESSAGE_BOARD_URL}/api/save-data`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(allData)
      });
      
      if (!saveResponse.ok) {
        throw new Error(`Failed to save: HTTP ${saveResponse.status}`);
      }
      
      // Create updated message data for response
      const updatedMessage = {
        id: args.messageId,
        content: args.content || allData[tabKey][msgIdx],
        tabId: tabKey,
        category: TAB_NAMES[tabKey] || `Tab ${tabKey}`,
        updatedAt: new Date().toISOString()
      };
      
      if (args.title) {
        updatedMessage.title = args.title;
      }
      
      return { content: [{ type: 'text', text: JSON.stringify(updatedMessage, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error updating message: ${error.message}` }], 
        isError: true 
      };
    }
  },

  async delete_message(args) {
    try {
      if (!args.messageId) {
        throw new Error('messageId is required');
      }
      
      // Get all existing data
      const allData = await apiRequest('/data.json');
      
      // Parse the message ID to find tab and index
      const [tabId, msgIdx] = args.messageId.replace('tab', '').split('-msg').map(part => parseInt(part));
      
      if (!tabId || isNaN(msgIdx)) {
        throw new Error(`Invalid message ID format: ${args.messageId}`);
      }
      
      const tabKey = tabId.toString();
      
      // Check if the tab and message exist
      if (!allData[tabKey] || !Array.isArray(allData[tabKey]) || !allData[tabKey][msgIdx]) {
        throw new Error(`Message not found: ${args.messageId}`);
      }
      
      // Store the deleted message for the response
      const deletedMessage = allData[tabKey][msgIdx];
      
      // Remove message from array
      allData[tabKey].splice(msgIdx, 1);
      
      // Update lastSaved timestamp
      allData.lastSaved = new Date().toLocaleString();
      
      // Save updated data back to server
      const saveResponse = await fetch(`${MESSAGE_BOARD_URL}/api/save-data`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(allData)
      });
      
      if (!saveResponse.ok) {
        throw new Error(`Failed to save: HTTP ${saveResponse.status}`);
      }
      
      const result = {
        success: true,
        messageId: args.messageId,
        tabId: tabKey,
        category: TAB_NAMES[tabKey] || `Tab ${tabKey}`,
        deletedAt: new Date().toISOString()
      };
      
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error deleting message: ${error.message}` }], 
        isError: true 
      };
    }
  },

  async get_categories(args) {
    try {
      // Simply return predefined tabs
      const categories = Object.keys(TAB_NAMES).map(key => ({
        id: key,
        name: TAB_NAMES[key]
      }));
      
      return { content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error getting categories: ${error.message}` }], 
        isError: true 
      };
    }
  }
};

// Tool definitions
const tools = [
  {
    name: 'get_messages',
    description: 'Get messages from the message board',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category' },
        limit: { type: 'number', description: 'Number of messages to retrieve' },
        page: { type: 'number', description: 'Page number for pagination' }
      }
    }
  },
  {
    name: 'get_message',
    description: 'Get a specific message by ID',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Message ID' }
      },
      required: ['messageId']
    }
  },
  {
    name: 'create_message',
    description: 'Create a new message',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Message title' },
        content: { type: 'string', description: 'Message content' },
        category: { type: 'string', description: 'Message category' },
        author: { type: 'string', description: 'Message author' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'update_message',
    description: 'Update an existing message',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Message ID to update' },
        title: { type: 'string', description: 'New message title' },
        content: { type: 'string', description: 'New message content' },
        category: { type: 'string', description: 'New message category' },
        author: { type: 'string', description: 'New message author' }
      },
      required: ['messageId']
    }
  },
  {
    name: 'delete_message',
    description: 'Delete a message',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Message ID to delete' }
      },
      required: ['messageId']
    }
  },
  {
    name: 'get_categories',
    description: 'Get all available categories',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Create MCP server
const server = new Server({
  name: 'modern-message-board-mcp',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!handlers[name]) {
    return { 
      content: [{ type: 'text', text: `Unknown tool: ${name}` }], 
      isError: true 
    };
  }
  
  try {
    return await handlers[name](args || {});
  } catch (error) {
    return { 
      content: [{ type: 'text', text: `Error executing ${name}: ${error.message}` }], 
      isError: true 
    };
  }
});

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Modern Message Board MCP Server started');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Server startup error:', error);
  process.exit(1);
});
