const WebSocketServer = require('ws');
const fs = require('fs');
const wss = new WebSocketServer.Server({ port: 8080 })
