import { writeFile, readdir, access, constants, readFile, unlink, rename } from "fs";
import { WebSocketServer } from "ws";
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
// wss.binaryType = 'arraybuffer';

function sendMessageToAllClients(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

wss.on('connection', function connection(ws) {
    console.log("New client connected!");
    ws.on('message', function message(message, isBinary) {
        if(isBinary) {
            currentCanvas = new Uint8Array(message);
            sendMessageToAllClients(currentCanvas);
        }
        else {
            handleCommand(message.toString()); // might need to be toString instead
            sendMessageToAllClients(message.toString());
        }
    });
    ws.send(currentCanvas);
});

server.listen(port, function listening() {
    console.log(`Express and WebSocket server running on ${port}`);
});

function handleCommand(message) {
    const cmd = JSON.parse(message);
    if (cmd.clear) currentCanvas = new Uint8Array(bytesPerImage);
    else if (cmd.newCanvasRequested) createNewCanvas();
    else if (cmd.nextCanvasRequested) switchToNextCanvas();
    else if (cmd.deleteCanvasRequested) deleteCurrentCanvas();
    else {
      const pixelOn = +(cmd.pixelOn); 
      const x = cmd.x; 
      const y = cmd.y;
      const size = cmd.size;
      for (let i = x; i < size; i++) {
        for (let j = y; j < size; j++) {
            let byteIndex = Math.floor((j * CANVAS_WIDTH + i) / 8);
            let bitIndex = 7 - (j * CANVAS_HEIGHT + i) % 8;
            currentCanvas[byteIndex] |= pixelOn << bitIndex;
        }
      }
    }
}

function saveCanvasToFile() {
    const filepath = "/srcc/" + currentCanvasNum + ".dat";
    writeFile(filepath, currentCanvas, (err) => {
        if (err) console.error("Error saving current canvas to file: " + filepath);
        else console.log("Successfully wrote current canvas to file: " + filepath);
    });
}

function findLastCanvasNumber() {
    let imageNumber = 0;
    const directoryPath = '/srcc';
    readdir(directoryPath, (err, files) => {
        if (err) console.log("Error reading number of files from images directory" + directoryPath);
        else imageNumber = files.length;
    });
    return imageNumber - 1;
}

// Loads the next stored canvas from memory if found, otherwise loads the first canvas.
function switchToNextCanvas() {
    let filepath = "/srcc/" + ++currentCanvasNum + ".dat";
    // This must happen after the currentCanvasNum is incremented to prevent the possibility of any -1.dat file being created.
    saveCanvasToFile();
    let nextCanvasExists = false;
    access(filepath, constants.F_OK, (err) => {
        if (err) nextCanvasExists = true;
    });
    if (!nextCanvasExists) {
        currentCanvasNum = 0;
        filepath = "/srcc/" + currentCanvasNum + ".dat";
    }
    readFile(filepath, (err, data) => {
        if (err) console.error("Error reading next canvas file: " + filepath);
        else currentCanvas = new Uint8Array(data);
    });
    sendMessageToAllClients(currentCanvas)
    filepath = "/srcc/currentCanvasNum";
    writeFile(filepath, currentCanvasNum.toString(), (err) => {
        if (err) console.error("Error writing canvas number to file");
        else console.log("Successfully wrote canvas number to file");
    });
}

// Creates a new blank canvas file in memory and switches to it.
function createNewCanvas() {
    let newCanvasNumber = findLastCanvasNumber() + 1;
    const filepath = "/srcc/" + newCanvasNumber + ".dat";
    writeFile(filepath, new Uint8Array(bytesPerImage), (err) => {
        if (err) console.error("Error writing new blank canvas to file: " + filepath);
        else console.log("Successfully wrote new blank canvas to file: " + filepath);
    });
    currentCanvasNum = newCanvasNumber - 1;
    switchToNextCanvas();
}

// Deletes the currently selected canvas from memory and switch to the next available canvas.
// Replaces the deleted canvas with the very last canvas to maintain continuity.
function deleteCurrentCanvas() {
    let replacementCanvas = findLastCanvasNumber();
    let replacementPath = "/srcc/" + replacementCanvas + ".dat";
    let currentCanvasPath = "/srcc/" + currentCanvasNum + ".dat";
    unlink(currentCanvasPath, (err) => {
        if (err) console.error("Error deleting saved canvas file: " + currentCanvasPath);
        else {
          console.log("Successfully removed saved canvas file: " + currentCanvasPath);
          if (replacementCanvas != currentCanvasNum) {
            rename(replacementPath, currentCanvasPath, (err) => {
                if (err) console.error("Error renaming file: " + replacementPath + " to: " + currentCanvasPath);
                else console.log("Succesfully renamed file: " + replacementPath + " to: " + currentCanvasPath);
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
    readFile(filepath, 'utf8', (err, data) => {
        if (err) {
            console.log("Unable to read saved canvas or it doesn't exist. Defaulting to new canvas...");
            createNewCanvas();
        }
        else { 
            console.log("Successfully loaded saved canvas from file: " + filepath);    
            currentCanvas = new Uint8Array(data);
        }
    });
}

setup();
setInterval(saveCanvasToFile, 30000);