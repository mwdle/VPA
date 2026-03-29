import {
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "fs";
import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import express from "express";
import { rateLimit } from "express-rate-limit";

const dataDir = "/var/lib/vpa";

/**
 * Virtual Display Configuration
 */

const CANVAS_WIDTH = 448;
const CANVAS_HEIGHT = 224;
const MAX_BRUSH_SIZE = 32;
const bytesPerImage = (CANVAS_WIDTH * CANVAS_HEIGHT) / 8;
let currentCanvas = new Uint8Array(bytesPerImage);
let currentCanvasNum = 0;

/**
 * The FILE_NUM_LIMIT environment variable determines how many image files can be saved on the server.
 * Set FILE_NUM_LIMIT to 0 for no limit on the number of image files that can be created on the server.
 * With a canvas height of 448x224 and 1 bit per pixel, the size of each image file on the server is 12.24 KB, therefore a limit of 1000 images would utilize at most 11.953 MB.
 * The client that requested a new canvas is notified if this limit has been reached.
 * WARNING: If the FILE_NUM_LIMIT is set to any number greater than 0, any bind mount folders in docker must only contain VPA created files for the limit to work properly and to avoid unexpected behavior.
 */
const fileLimitString = process.env.FILE_NUM_LIMIT;
if (typeof fileLimitString === "undefined") {
  console.error(
    "FILE_NUM_LIMIT environment variable does not exist. Please restart the container with the property set. See README.",
  );
  process.exit(1);
}
let fileNumLimit = parseInt(fileLimitString);
if (isNaN(fileNumLimit)) {
  console.error(
    "FILE_NUM_LIMIT environment variable could not be parsed. Please restart the container with the property correctly set. See README.",
  );
  process.exit(1);
} else fileNumLimit += 1; // Account for the singular file created to track the current canvas number across container stops/starts.

const FILE_PERMISSIONS = 0o600; // Read/write for owner only

/**
 * App Title Configuration
 */

const appTitle = process.env.APP_TITLE;
if (typeof appTitle === "undefined") {
  console.error(
    "APP_TITLE environment variable does not exist. Please restart the container with the property set. See README.",
  );
  process.exit(1);
}
const appTitleSplit = appTitle.split(" ");
let appTitleAcronym = "";
appTitleSplit.forEach(function (titleWord) {
  appTitleAcronym += titleWord.charAt(0);
});

/**
 * Server Configuration
 */

const port = 3000;
const expressServer = express();
const trustedProxies = process.env.TRUSTED_PROXIES;
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

if (typeof trustedProxies === "undefined") {
  console.error(
    "trustedProxies environment variable does not exist. Please restart the container with the property set. See README.",
  );
  process.exit(1);
}
expressServer.set("trust proxy", trustedProxies);
expressServer.use(express.static("public"));
expressServer.get("/health", (req, res) => {
  res.status(200).send("OK");
});
expressServer.use(rateLimiter);
expressServer.get("/", (req, res) => {
  let template = readFileSync("views/template.html", "utf8");
  const html = template
    .replaceAll("TitleAcronym", appTitleAcronym)
    .replaceAll("AppTitle", appTitle);
  res.send(html);
});
const server = http.createServer(expressServer);

/**
 * Websockets Server Configuration
 */

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: bytesPerImage,
});

server.on("upgrade", (request, socket, head) => {
  const { origin } = request.headers;
  const hostHeader =
    request.headers["x-forwarded-host"] || request.headers.host || "";
  const host = hostHeader.split(",")[0].trim();

  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
    console.log(`Rejected unauthorized origin: ${origin}`);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

function sendMessageToAllClients(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

wss.on("connection", function connection(ws, req) {
  let ip;
  if (req.headers["x-forwarded-for"])
    ip = req.headers["x-forwarded-for"].split(",")[0].trim();
  else ip = req.socket.remoteAddress;
  console.log("New client connected: " + ip);

  // Send the current canvas state to any newly connected client
  ws.send(currentCanvas);

  ws.on("error", console.error);

  // Handle ping/pong
  ws.isAlive = true;
  ws.on("pong", function pongReceived() {
    console.log(`Pong received from client: ${ip}`);
    this.isAlive = true;
  });

  // Handle incoming messages
  ws.on("message", function message(message, isBinary) {
    if (isBinary) {
      if (message.length <= currentCanvas.length) {
        currentCanvas.set(message);
        sendMessageToAllClients(currentCanvas);
      } else
        console.error(
          "Received client binary that is larger than the expected canvas size. Rejecting.",
        );
    } else {
      handleCommand(message.toString(), ws);
      // Relay received message to all clients.
      sendMessageToAllClients(message.toString());
    }
  });
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", function close() {
  clearInterval(interval);
});

function handleCommand(message, client) {
  let cmd;
  try {
    cmd = JSON.parse(message);
  } catch (err) {
    console.error(`Malformed JSON from client: ${err.message}`);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ error: "Invalid JSON format" }));
    }
    return;
  }
  if (cmd.clear) currentCanvas.set(new Uint8Array(bytesPerImage));
  else if (cmd.newCanvasRequested) createNewCanvas(client);
  else if (cmd.nextCanvasRequested) switchToNextCanvas(true, client);
  else if (cmd.deleteCanvasRequested) deleteCurrentCanvas();
  else {
    const pixelOn = +cmd.pixelOn;
    const x = cmd.x;
    const y = cmd.y;
    const size = cmd.size;

    const isValid =
      Number.isInteger(x) &&
      x >= 0 &&
      x < CANVAS_WIDTH &&
      Number.isInteger(y) &&
      y >= 0 &&
      y < CANVAS_HEIGHT &&
      Number.isInteger(size) &&
      size > 0 &&
      size <= MAX_BRUSH_SIZE;

    // Set as many pixels as needed for the selected brush size.
    if (isValid) {
      for (let i = y; i < y + size && i < CANVAS_HEIGHT; i++) {
        for (let j = x; j < x + size && j < CANVAS_WIDTH; j++) {
          let byteIndex = Math.floor((i * CANVAS_WIDTH + j) / 8);
          let bitIndex = Math.floor(7 - ((i * CANVAS_WIDTH + j) % 8));
          if (pixelOn) currentCanvas[byteIndex] |= 1 << bitIndex;
          else currentCanvas[byteIndex] &= ~(1 << bitIndex);
        }
      }
    }
  }
}

/**
 * Canvas actions configuration
 */

function saveCanvasToFile() {
  let filepath = `${dataDir}/${currentCanvasNum}.dat`;
  if (existsSync(filepath)) {
    writeFileSync(filepath, currentCanvas, { mode: FILE_PERMISSIONS });
    console.log(`Saved current canvas to file: ${filepath}`);
  }
}

// Loads the next stored canvas from memory if found, otherwise loads the first canvas.
function switchToNextCanvas(saveCurrent, client) {
  const files = readdirSync(dataDir);
  const numFiles = files.length;
  if (numFiles == 2 && client != undefined) {
    // Account for the singular file created to track the current canvas number across container stops/starts.
    const msg = { noCanvasToSwitchTo: true };
    client.send(JSON.stringify(msg));
  }
  let filepath = `${dataDir}/${currentCanvasNum}.dat`;
  if (saveCurrent) saveCanvasToFile();
  filepath = `${dataDir}/${++currentCanvasNum}.dat`;
  if (!existsSync(filepath)) {
    currentCanvasNum = 0;
    filepath = `${dataDir}/${currentCanvasNum}.dat`;
  }
  currentCanvas.set(readFileSync(filepath));
  sendMessageToAllClients(currentCanvas);
  console.log(
    `Switched to next canvas: ${filepath}, and relayed to all clients`,
  );
  filepath = `${dataDir}/currentCanvasNum`;
  writeFileSync(filepath, currentCanvasNum.toString(), {
    mode: FILE_PERMISSIONS,
  });
}

// Creates a new blank canvas file in memory and switches to it.
function createNewCanvas(client) {
  const files = readdirSync(dataDir);
  const numFiles = files.length;
  if (fileNumLimit == 0 || numFiles < fileNumLimit) {
    saveCanvasToFile();
    let newCanvasNumber = 0;
    let filepath = `${dataDir}/${newCanvasNumber}.dat`;
    while (existsSync(filepath)) {
      filepath = `${dataDir}/${++newCanvasNumber}.dat`;
    }
    currentCanvas.set(new Uint8Array(bytesPerImage));
    writeFileSync(filepath, currentCanvas, { mode: FILE_PERMISSIONS });
    sendMessageToAllClients(currentCanvas);
    console.log(
      `Created new canvas, stored to file: ${filepath}, and relayed to all clients`,
    );
    currentCanvasNum = newCanvasNumber;
    filepath = `${dataDir}/currentCanvasNum`;
    writeFileSync(filepath, currentCanvasNum.toString(), {
      mode: FILE_PERMISSIONS,
    });
  } else {
    const msg = { fileLimitReached: true };
    client.send(JSON.stringify(msg));
  }
}

// Deletes the currently selected canvas from memory and switch to the next available canvas.
// Replaces the deleted canvas with the very last canvas to maintain continuity.
function deleteCurrentCanvas() {
  let replacementCanvasNum = currentCanvasNum + 1;
  let replacementCanvasPath = `${dataDir}/${replacementCanvasNum}.dat`;
  while (existsSync(replacementCanvasPath)) {
    replacementCanvasPath = `${dataDir}/${++replacementCanvasNum}.dat`;
  }
  replacementCanvasPath = `${dataDir}/${--replacementCanvasNum}.dat`;
  let currentCanvasPath = `${dataDir}/${currentCanvasNum}.dat`;
  unlinkSync(currentCanvasPath);
  console.log(`Deleted canvas: ${currentCanvasPath}`);
  if (replacementCanvasNum != currentCanvasNum) {
    renameSync(replacementCanvasPath, currentCanvasPath);
    currentCanvasNum--;
    console.log(`Replaced deleted canvas with: ${replacementCanvasPath}`);
    switchToNextCanvas(false);
  } else if (currentCanvasNum == 0) {
    console.log("No canvases remain. Creating a new canvas");
    createNewCanvas();
  } else {
    console.log("No need to replace deleted canvas. Switching to next canvas");
    switchToNextCanvas(false);
  }
}

/**
 *  Setup and intial configuration.
 */

function setup() {
  let filepath = dataDir;
  if (!existsSync(filepath)) mkdirSync(filepath, { recursive: true });
  filepath = `${dataDir}/currentCanvasNum`;
  if (existsSync(filepath)) {
    const savedInteger = parseInt(readFileSync(filepath, "utf8"));
    if (!isNaN(savedInteger)) currentCanvasNum = savedInteger;
  } else
    writeFileSync(filepath, currentCanvasNum.toString(), {
      mode: FILE_PERMISSIONS,
    });
  filepath = `${dataDir}/${currentCanvasNum}.dat`;
  if (existsSync(filepath)) {
    currentCanvas.set(readFileSync(filepath));
    console.log(`Read ${filepath} and stored in currentCanvas`);
  } else createNewCanvas();
  server.listen(port, function listening() {
    console.log(`Express and WebSocket server running on ${port}`);
  });
  setInterval(saveCanvasToFile, 300000);
}

setup();
