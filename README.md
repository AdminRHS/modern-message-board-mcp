# Modern Message Board MCP

Simple MCP service for accessing and managing messages on a modern message board application.

## MCP Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "modern-message-board-mcp": {
      "command": "npx",
      "args": ["github:AdminRHS/modern-message-board-mcp"]
    }
  }
}
```

### Local Installation

Alternative method - global package installation:

```bash
npm install -g github:AdminRHS/modern-message-board-mcp
```

Then configure mcp.json like this:

```json
{
  "mcpServers": {
    "modern-message-board-mcp": {
      "command": "modern-message-board-mcp"
    }
  }
}
```

## GitHub Repository

Project is available on GitHub: [AdminRHS/modern-message-board-mcp](https://github.com/AdminRHS/modern-message-board-mcp)

### Publishing Changes to GitHub

```bash
# Clone repository (for first use)
git clone https://github.com/AdminRHS/modern-message-board-mcp.git

# To push changes
git add .
git commit -m "Your change description"
git push origin main
```

## Features

- **Get Messages**: Retrieve messages with filtering
- **Create Messages**: Add new messages to the board
- **Update Messages**: Modify existing messages
- **Delete Messages**: Remove messages
- **Category Management**: Work with message categories

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **No environment variables needed:**
   Server URL and authentication are already configured in the code.

3. **Run the service:**
   ```bash
   npm start
   ```

## Available Tools

### Message Operations
- `get_messages` — Retrieve messages with optional filtering
- `get_message` — Get a specific message by ID  
- `create_message` — Create a new message
- `update_message` — Update an existing message
- `delete_message` — Delete a message

### Category Operations
- `get_categories` — List all available categories

## Usage Examples

### Create a Message
```javascript
await mcp.create_message({
  title: "Hello World",
  content: "This is my first message!",
  category: "general",
  author: "John Doe"
});
```

### Update a Message
```javascript
await mcp.update_message({
  messageId: "msg123",
  title: "Updated Title",
  content: "Updated content here"
});
```

### Get Messages
```javascript
// Get all messages
await mcp.get_messages();

// Get messages from specific category
await mcp.get_messages({
  category: "announcements",
  limit: 10
});
```

## License

MIT
