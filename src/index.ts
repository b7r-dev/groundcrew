#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const transport = new StdioServerTransport();
const server = createServer();

// Write logs to stderr only
server.onerror = (error) => {
  console.error('[groundcrew error]', error);
};

await server.connect(transport);
