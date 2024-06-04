const { WebSocketServer } = require('ws');
const { writeFile, readdir, access, constants, readFile, unlink, rename } = require('fs');

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;

const bytesPerImage = (CANVAS_WIDTH * CANVAS_HEIGHT) / 8;
 
let currentCanvas = new Uint8Array(bytesPerImage);
let currentCanvasNum = 0;

const express = require('express')
const app = express()
const port = 80
app.use(express.static('public'))

const server = app.listen(port, () => {
  console.log(`srcc server listening on port ${app}`)
})

const wss = new WebSocketServer({server, path: '/ws'});

wss.on('connection', (ws) => {
    ws.send(currentCanvas.buffer);
});

wss.on('message', (message) => {
    sendMessageToAllClients(message);
    if (typeof message.data === "string") handleCommand(message);
    else if (message.data instanceof ArrayBuffer) currentCanvas = new Uint8Array(message.data);
});

function sendMessageToAllClients(message) {
    wss.clients.forEach((client) => {
        client.send(message);
    });
}

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
    const filepath = "/srcc/images/" + currentCanvasNum + ".dat";
    writeFile(filepath, currentCanvas, (err) => {
        if (err) console.error("Error saving current canvas to file: " + filepath);
        else console.log("Successfully wrote current canvas to file: " + filepath);
    });
}

function findLastCanvasNumber() {
    let imageNumber = 0;
    const directoryPath = '/srcc/images';
    readdir(directoryPath, (err, files) => {
        if (err) console.log("Error reading number of files from images directory" + directoryPath);
        else imageNumber = files.length;
    });
    return imageNumber - 1;
}

// Loads the next stored canvas from memory if found, otherwise loads the first canvas.
function switchToNextCanvas() {
    saveCanvasToFile();
    let filepath = "/srcc/images/" + ++currentCanvasNum + ".dat";
    let nextCanvasExists = false;
    access(filepath, constants.F_OK, (err) => {
        if (err) nextCanvasExists = true;
    });
    if (!nextCanvasExists) {
        currentCanvasNum = 0;
        filepath = "/srcc/images/" + currentCanvasNum + ".dat";
    }
    readFile(filepath, (err, data) => {
        if (err) console.error("Error reading next canvas file: " + filepath);
        else currentCanvas = new Uint8Array(data);
    });
    sendMessageToAllClients(currentCanvas.buffer)
    filepath = "/srcc/images/currentCanvasNum";
    writeFile(filepath, currentCanvasNum.toString(), (err) => {
        if (err) console.error("Error writing canvas number to file");
        else console.log("Successfully wrote canvas number to file");
    });
}

// Creates a new blank canvas file in memory and switches to it.
function createNewCanvas() {
    let newCanvasNumber = findLastCanvasNumber() + 1;
    const filepath = "/srcc/images/" + newCanvasNumber + ".dat";
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
    let replacementPath = "/srcc/images/" + replacementCanvas + ".dat";
    currentCanvasPath = "/srcc/images/" + currentCanvasNum + ".dat";
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
    let filepath = "/srcc/images/currentCanvasNum";
    readFile(filepath, 'utf8', (err, data) => {
        if (err) console.log("Unable to read saved canvas number or it doesn't exist.");
        else console.log("Successfully loaded saved canvas number");    
        const savedInteger = parseInt(data);
        if (!isNaN(savedInteger)) currentCanvasNum = savedInteger;
    });
    filepath = "/srcc/images/" + currentCanvasNum + ".dat";
    readFile(filepath, 'utf8', (err, data) => {
        if (err) {
            console.log("Unable to read saved canvas or it doesn't exist. Defaulting to new canvas...");
            createNewCanvas();
        }
        else console.log("Successfully loaded saved canvas from file: " + filepath);    
        currentCanvas = new Uint8Array(data);
    });
}

setup();
setInterval(saveCanvasToFile, 30000);