import { writeFile, readdir, access, constants, readFile, unlink, rename, accessSync, fstat, existsSync } from "fs";
import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import express from "express";

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;

const bytesPerImage = (CANVAS_WIDTH * CANVAS_HEIGHT) / 8;
 
let currentCanvas = new Uint8Array(bytesPerImage);
let currentCanvasNum = 0;

const port = 80;
const expressServer = express();
expressServer.use(express.static('public'));
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
            if (message.length <= currentCanvas.length) currentCanvas.set(message);
            else console.error("Received client binary that is larger than the expected canvas size. Rejecting.");
            sendMessageToAllClients(currentCanvas);
        }
        else {
            handleCommand(message.toString());
            sendMessageToAllClients(message.toString());
        }
    });
});

server.listen(port, function listening() {
    console.log(`Express and WebSocket server running on ${port}`);
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

      for (let i = y; i < y + size && i < CANVAS_HEIGHT; i++) {
        for (let j = x; j < x + size && j < CANVAS_WIDTH; j++) {
            let byteIndex = Math.floor((i * CANVAS_WIDTH + j) / 8);
            let bitIndex = Math.floor(7 - (i * CANVAS_WIDTH + j) % 8);
            currentCanvas[byteIndex] |= (pixelOn << bitIndex);
        }
      }
    }
}

function saveCanvasToFile() {
    let filepath = "/srcc/" + currentCanvasNum + ".dat";
    writeFile(filepath, currentCanvas, (err) => {
        if (err) console.error("Error saving current canvas to file: " + filepath);
        else console.log("Successfully wrote current canvas to file: " + filepath);
    });
}

// Loads the next stored canvas from memory if found, otherwise loads the first canvas.
function switchToNextCanvas() {
    saveCanvasToFile();
    let filepath = "/srcc/" + ++currentCanvasNum + ".dat";
    if (!existsSync(filepath)) {
        currentCanvasNum = 0;
        filepath = "/srcc/" + currentCanvasNum + ".dat";
    }
    readFile(filepath, (err, data) => {
        if (err) console.error("Error reading next canvas file: " + filepath);
        else currentCanvas.set(new Uint8Array(data));
    });
    sendMessageToAllClients(currentCanvas);
    filepath = "/srcc/currentCanvasNum";
    writeFile(filepath, currentCanvasNum.toString(), (err) => {
        if (err) console.error("Error writing canvas number to file");
        else console.log("Successfully wrote canvas number to file");
    });
}

// Creates a new blank canvas file in memory and switches to it.
function createNewCanvas() {
    let newCanvasNumber = 0;
    let filepath = "/srcc/" + newCanvasNumber + ".dat";
    while (existsSync(filepath)) {
        filepath = "/srcc/" + (++newCanvasNumber) + ".dat";
    }
    let newCanvas = new Uint8Array(bytesPerImage);
    writeFile(filepath, newCanvas, (err) => {
        if (err) console.error("Error writing new blank canvas to file: " + filepath);
        else {
            console.log("Successfully wrote new blank canvas to file: " + filepath);
            currentCanvasNum = newCanvasNumber;
            currentCanvas.set(newCanvas);
            sendMessageToAllClients(currentCanvas);
        }
    });
}

// Deletes the currently selected canvas from memory and switch to the next available canvas.
// Replaces the deleted canvas with the very last canvas to maintain continuity.
function deleteCurrentCanvas() {
    let replacementCanvasNum = currentCanvasNum + 1;
    let replacementCanvasPath = "/srcc/" + replacementCanvasNum + ".dat";
    while (existsSync(replacementCanvasPath)) {
        replacementCanvasPath = "/srcc/" + replacementCanvasNum + ".dat";
    }
    replacementCanvasPath = "/srcc/" + --replacementCanvasNum + ".dat";
    let currentCanvasPath = "/srcc/" + currentCanvasNum + ".dat";
    unlink(currentCanvasPath, (err) => {
        if (err) console.error("Error deleting saved canvas file: " + currentCanvasPath);
        else {
          console.log("Successfully removed saved canvas file: " + currentCanvasPath);
          if (replacementCanvasNum != currentCanvasNum) {
            rename(replacementCanvasPath, currentCanvasPath, (err) => {
                if (err) { 
                    console.error("Error renaming file: " + replacementCanvasPath + " to: " + currentCanvasPath + "... Saving canvas to file again");
                }
                else console.log("Succesfully renamed file: " + replacementCanvasPath + " to: " + currentCanvasPath);
            });
            currentCanvasNum--;
            switchToNextCanvas();
          }
          else if (currentCanvasNum == 0) createNewCanvas();
          else switchToNextCanvas();
        }
    });
}

function setup() {
    let filepath = "/srcc/currentCanvasNum";
    readFile(filepath, 'utf8', (err, data) => {
        if (err) console.log("Unable to read saved canvas number or it doesn't exist.");
        else console.log("Successfully loaded saved canvas number");    
        const savedInteger = parseInt(data);
        if (!isNaN(savedInteger)) currentCanvasNum = savedInteger;
    });
    filepath = "/srcc/" + currentCanvasNum + ".dat";
    readFile(filepath, (err, data) => {
        if (err) {
            console.log("Unable to read saved canvas or it doesn't exist. Defaulting to new canvas...");
            createNewCanvas();
        }
        else { 
            console.log("Successfully loaded saved canvas from file: " + filepath);    
            currentCanvas.set(new Uint8Array(data));
        }
    });
}

setup();
setInterval(saveCanvasToFile, 60000); //TODO: Change this to something larger after testing.