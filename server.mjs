import { writeFileSync, readFileSync, unlinkSync, renameSync, existsSync, mkdirSync } from "fs";
import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import express from "express";

const CANVAS_WIDTH = 448;
const CANVAS_HEIGHT = 224;
const MAX_BRUSH_SIZE = 64;
const bytesPerImage = (CANVAS_WIDTH * CANVAS_HEIGHT) / 8;
let currentCanvas = new Uint8Array(bytesPerImage);
let currentCanvasNum = 0;

const appTitle = process.env.APP_TITLE;
const appTitleNoSpaces = appTitle.replaceAll(" ", "");
const appTitleSplit = appTitle.split(' ');
let appTitleAcronym = "";
appTitleSplit.forEach(function(titleWord) {
    appTitleAcronym += titleWord.charAt(0);
});

const port = 80;
const expressServer = express();
expressServer.use(express.static('public'));
expressServer.get('/', (req, res) => {
    let template = readFileSync("views/template.html", 'utf8');
    const html = template.replaceAll("TitleAcronym", appTitleAcronym).replaceAll("AppTitle", appTitle);
    res.send(html);
});
const server = http.createServer(expressServer);

const wss = new WebSocketServer({ server: server });

function sendMessageToAllClients(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

wss.on('connection', function connection(ws) {
    console.log("New client connected!");
    ws.send(currentCanvas);
    ws.on('message', function message(message, isBinary) {
        if(isBinary) {
            if (message.length <= currentCanvas.length) {
                currentCanvas.set(message);
                sendMessageToAllClients(currentCanvas);
            }
            else console.error("Received client binary that is larger than the expected canvas size. Rejecting.");
        }
        else {
            handleCommand(message.toString());
            sendMessageToAllClients(message.toString());
        }
    });
});

function handleCommand(message) {
    const cmd = JSON.parse(message);
    if (cmd.clear) currentCanvas.set(new Uint8Array(bytesPerImage));
    else if (cmd.newCanvasRequested) createNewCanvas();
    else if (cmd.nextCanvasRequested) switchToNextCanvas();
    else if (cmd.deleteCanvasRequested) deleteCurrentCanvas();
    else {
        const pixelOn = +(cmd.pixelOn); 
        const x = cmd.x; 
        const y = cmd.y;
        const size = cmd.size;

        if (x < CANVAS_WIDTH && y < CANVAS_HEIGHT && size <= MAX_BRUSH_SIZE) {
            for (let i = y; i < y + size && i < CANVAS_HEIGHT; i++) {
                for (let j = x; j < x + size && j < CANVAS_WIDTH; j++) {
                    let byteIndex = Math.floor((i * CANVAS_WIDTH + j) / 8);
                    let bitIndex = Math.floor(7 - (i * CANVAS_WIDTH + j) % 8);
                    if (pixelOn) currentCanvas[byteIndex] |= (1 << bitIndex);
                    else currentCanvas[byteIndex] &= ~(1 << bitIndex);
                }
            }
        }
    }
}

function saveCanvasToFile() {
    let filepath = `/vpa/${appTitleNoSpaces}/${currentCanvasNum}.dat`;
    writeFileSync(filepath, currentCanvas);
    console.log(`Saved current canvas to file: ${filepath}`);
}

// Loads the next stored canvas from memory if found, otherwise loads the first canvas.
function switchToNextCanvas() {
    let filepath = `/vpa/${appTitleNoSpaces}/${currentCanvasNum}.dat`;
    if (existsSync(filepath)) saveCanvasToFile();
    filepath = `/vpa/${appTitleNoSpaces}/${++currentCanvasNum}.dat`;
    if (!existsSync(filepath)) {
        currentCanvasNum = 0;
        filepath = `/vpa/${appTitleNoSpaces}/${currentCanvasNum}.dat`;
    }
    currentCanvas.set(readFileSync(filepath));
    sendMessageToAllClients(currentCanvas);
    console.log(`Switched to next canvas: ${filepath}, and relayed to all clients`);
    filepath = `/vpa/${appTitleNoSpaces}/currentCanvasNum`;
    writeFileSync(filepath, currentCanvasNum.toString());
}

// Creates a new blank canvas file in memory and switches to it.
function createNewCanvas() {
    let filepath = `/vpa/${appTitleNoSpaces}/${currentCanvasNum}.dat`;
    if (existsSync(filepath)) saveCanvasToFile();
    let newCanvasNumber = 0;
    filepath = `/vpa/${appTitleNoSpaces}/${newCanvasNumber}.dat`;
    while (existsSync(filepath)) {
        filepath = `/vpa/${appTitleNoSpaces}/${++newCanvasNumber}.dat`;
    }
    currentCanvas.set(new Uint8Array(bytesPerImage));
    writeFileSync(filepath, currentCanvas);
    sendMessageToAllClients(currentCanvas);
    console.log(`Created new canvas, stored to file: ${filepath}, and relayed to all clients`);
    currentCanvasNum = newCanvasNumber;
    filepath = `/vpa/${appTitleNoSpaces}/currentCanvasNum`;
    writeFileSync(filepath, currentCanvasNum.toString());
}

// Deletes the currently selected canvas from memory and switch to the next available canvas.
// Replaces the deleted canvas with the very last canvas to maintain continuity.
function deleteCurrentCanvas() {
    let replacementCanvasNum = currentCanvasNum + 1;
    let replacementCanvasPath = `/vpa/${appTitleNoSpaces}/${replacementCanvasNum}.dat`;
    while (existsSync(replacementCanvasPath)) {
        replacementCanvasPath = `/vpa/${appTitleNoSpaces}/${++replacementCanvasNum}.dat`;
    }
    replacementCanvasPath = `/vpa/${appTitleNoSpaces}/${--replacementCanvasNum}.dat`;
    let currentCanvasPath = `/vpa/${appTitleNoSpaces}/${currentCanvasNum}.dat`;
    unlinkSync(currentCanvasPath);
    console.log(`Deleted canvas: ${currentCanvasPath}`);
    if (replacementCanvasNum != currentCanvasNum) {
        renameSync(replacementCanvasPath, currentCanvasPath);
        currentCanvasNum--;
        switchToNextCanvas();
        console.log(`Replaced deleted canvas with: ${replacementCanvasPath}`);
    }
    else if (currentCanvasNum == 0) {
        createNewCanvas();
        console.log("No canvases remain. Creating a new canvas");
    }
    else {
        switchToNextCanvas();
        console.log("No need to replace deleted canvas. Switching to next canvas");
    }
}

function setup() {
    let filepath = `/vpa/${appTitleNoSpaces}`;
    if (!existsSync(filepath)) mkdirSync(filepath);
    filepath = `/vpa/${appTitleNoSpaces}/currentCanvasNum`;
    if (existsSync(filepath)) {
        const savedInteger = parseInt(readFileSync(filepath, 'utf8'));
        if (!isNaN(savedInteger)) currentCanvasNum = savedInteger;
    }
    else writeFileSync(filepath, currentCanvasNum.toString());
    filepath = `/vpa/${appTitleNoSpaces}/${currentCanvasNum}.dat`;
    if (existsSync(filepath)) {
        currentCanvas.set(readFileSync(filepath));
        console.log(`Read ${filepath} and stored in currentCanvas`);
    }
    else createNewCanvas();
    server.listen(port, function listening() {
        console.log(`Express and WebSocket server running on ${port}`);
    });
    setInterval(saveCanvasToFile, 300000);
}

setup();