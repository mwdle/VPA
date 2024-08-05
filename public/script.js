const canvas = document.getElementById("canvas");
const guide = document.getElementById("guide");
const clearButton = document.getElementById("clearButton");
const brushSizeSelector = document.getElementById('brush-select');
const drawing = canvas.getContext("2d");
const eraserToggle = document.getElementById("eraserToggleCheckbox");

canvas.width = 896;
canvas.height = 448;
let virtualDisplayWidth = 448;
let virtualDisplayHeight = 224;
const canvasMultiplier = canvas.width / virtualDisplayWidth;

let brushSize = 2;
let horizontalCellCount = virtualDisplayWidth / brushSize;
let verticalCellCount = virtualDisplayHeight / brushSize;
let cellSideLength = canvas.width / horizontalCellCount;
let lastX = -1;
let lastY = -1;

let eraserOn = false;
let eraserStateChanged = false;
let isDrawing = false;

drawing.fillStyle = "#242526";
drawing.fillRect(0, 0, canvas.width, canvas.height);
setupGridGuides();

/**
 * Distribution of threshold values for color to monochrome image conversions.
 */
let threshold = [ 0.25, 0.26, 0.27, 0.28, 0.29, 0.3, 0.31, 0.32, 
  0.33, 0.34, 0.35, 0.36, 0.37, 0.38, 0.39, 0.4, 0.41, 0.42,
  0.43, 0.44, 0.45, 0.46, 0.47, 0.48, 0.49, 0.5, 0.51, 0.52, 0.53,
  0.54, 0.55, 0.56, 0.57, 0.58, 0.59, 0.6, 0.61, 0.62, 0.63, 0.64,
  0.65, 0.66, 0.67, 0.68, 0.69 ];

const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
let gateway = `${protocol}://${window.location.hostname}`;
let websocket;
let isFirstConnect = true;

function initWebSocket() {
  websocket = new WebSocket(gateway);
  websocket.binaryType = "arraybuffer";
  websocket.onclose = onDisconnect;
  websocket.onmessage = onMessage;
  websocket.onopen = onConnect;
}

window.addEventListener('offline', onDisconnect);

/**
 * Toast notifications for connect/disconnect
 */
let disconnectedToastVisible = false;
let disconnectedToast = Toastify({
  text: "Disconnected! Reconnecting...",
  duration: -1,
  gravity: "top", // `top` or `bottom`
  position: "left", // `left`, `center` or `right`
  style: {
    boxShadow: 'none',
    background: "#610a0a",
    borderRadius: '7px',
  }
});

let connectedToast = Toastify({
  text: "Succesfully Reconnected!",
  duration: 3500,
  gravity: "top", // `top` or `bottom`
  position: "left", // `left`, `center` or `right`
  style: {
    boxShadow: 'none',
    background: "#2d6c1a",
    borderRadius: '7px',
  }
});

/**
 * Reconnect to websocket in case of closed/lost connection.
 */
function onDisconnect() {
  if (!disconnectedToastVisible) {
    disconnectedToast.showToast();
    disconnectedToastVisible = true;
  }
  setTimeout(initWebSocket, 2450);
}

function onConnect() {
  if (isFirstConnect) isFirstConnect = false;
  else if (disconnectedToastVisible) {
      disconnectedToastVisible = false;
      disconnectedToast.hideToast();
      connectedToast.showToast();
  }
}

/**
 * Receive websocket messages from the server and handle them accordingly.
 */
function onMessage(e) {
  // If the data is a string, it is a command containing pixel data that was relayed by the server from a client.
  if (typeof e.data === "string") parseCommand(e);
  // If the data is an arrayBuffer, it is a binary representation of the current state of the canvas on the server.
  else if (e.data instanceof ArrayBuffer) parseCanvasState(e);
}

function sendMessageToServer(data) {
  try {
    websocket.send(data);
  }
  catch (ignored) {} 
}

/**
 * Converts color image data into monochrome by randomly selecting threshold values from a distribution to produce a dithering effect.
 */
function dither(imgCtx, binaryRepresentation) {
  let imageData = imgCtx.getImageData(0, 0, virtualDisplayWidth, virtualDisplayHeight).data;
  for (let i = 0; i < virtualDisplayHeight*virtualDisplayWidth*4; i += 4) {
    const lum = ((imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3) / 255;
    let pixelNum = i / 4;
    let byteIndex = Math.floor(pixelNum / 8);
    let bitIndex = 7 - ((pixelNum) % 8);
    let color = (lum >= threshold[Math.floor(Math.random() * threshold.length)]) ? 1 : 0;
    binaryRepresentation[byteIndex] |= color << bitIndex;
  }
} 

/**
 * Scales an image to fit physical display, converts it to black and white, and sends it to the server.
 */
function uploadImageToServer(e) {
    let image = new Image();
    image.src = window.URL.createObjectURL(document.getElementById('imageUpload').files[0]);
    image.onload = function() {
      let upload = document.createElement('canvas');
      let ctx = upload.getContext('2d');

      // Scale the image to fit the physical display.
      upload.width = image.width * virtualDisplayWidth / image.width;
      upload.height = image.height * virtualDisplayHeight / image.height;
      ctx.drawImage(image, 0, 0, virtualDisplayWidth, virtualDisplayHeight);

      // Convert the image to black and white and store it in a binary format to send to the server.
      let binaryRepresentation = new Uint8Array(virtualDisplayWidth * virtualDisplayHeight / 8);
      dither(ctx, binaryRepresentation);
      sendMessageToServer(binaryRepresentation.buffer);
      document.getElementById('imageUpload').value = '';
      Toastify({
        text: "Uploading image...",
        duration: 3000,
        gravity: "top", // `top` or `bottom`
        position: "left", // `left`, `center` or `right`
        style: {
          boxShadow: 'none',
          background: "#2d6c1a",
          borderRadius: '7px',
        }
      }).showToast();
  };
}

/**
 * Parse a command from the server.
 * Apply pixel changes from the server to the canvas.
 * Notify the user if a request to create a new canvas was rejected because the server is full.
 * Notify the user if a request to switch the canvas occured when only one canvas exists.
 */
function parseCommand(e) {
  const msg = JSON.parse(e.data);
  if (msg.fileLimitReached) {
    Toastify({
      text: "Server is full! Failed to create a new canvas. Please contact your server administrator to request more storage.",
      duration: 6500,
      gravity: "top", // `top` or `bottom`
      position: "left", // `left`, `center` or `right`
      style: {
        boxShadow: 'none',
        background: "#610a0a",
        borderRadius: '7px',
      }
    }).showToast();
  }
  if (msg.noCanvasToSwitchTo) {
    Toastify({
      text: "Only one canvas exists!",
      duration: 3000,
      gravity: "top", // `top` or `bottom`
      position: "left", // `left`, `center` or `right`
      style: {
        boxShadow: 'none',
        background: "#610a0a",
        borderRadius: '7px',
      }
    }).showToast();
  }
  if (msg.clear) {
    drawing.fillStyle = "#242526";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
  }
  else {
    if (msg.pixelOn) drawing.fillStyle = "#FFFFFF"
    else drawing.fillStyle = "#242526"
    const x = msg.x * canvasMultiplier;
    const y = msg.y * canvasMultiplier;
    const cellSideLength = canvas.width / (virtualDisplayWidth / msg.size);
    drawing.fillRect(x, y, cellSideLength, cellSideLength);
  }
}

/**
 * Extract each bit from the arrayBuffer received from the server and apply it to the canvas.
 */
function parseCanvasState(e) {
  const pixels = new Uint8Array(e.data);
  for (let y = 0; y < virtualDisplayHeight; y++) {
    for (let x = 0; x < virtualDisplayWidth; x++) {
      let byteIndex = Math.floor((y * virtualDisplayWidth + x) / 8);
      let bitIndex = 7 - (y * virtualDisplayWidth + x) % 8;
      let bit = (pixels[byteIndex] >> bitIndex) & 1;
      if (bit) drawing.fillStyle = "#FFFFFF";
      else drawing.fillStyle = "#242526";
      drawing.fillRect(x * canvasMultiplier, y * canvasMultiplier, canvasMultiplier, canvasMultiplier);
    }
  }
}

/**
 * Sets up grid guides for the canvas based on the currently selected brush size.
 */
function setupGridGuides() {
  const guideLines = guide.querySelectorAll('div');
  guideLines.forEach(line => line.remove());

  // No guides for brush sizes smaller than 4 because pixels are too small to properly display grid.
  if (brushSize >= 4) {
    guide.style.width = `${canvas.width}px`;
    guide.style.height = `${canvas.height}px`;
    guide.style.gridTemplateColumns = `repeat(${horizontalCellCount}, 1fr)`;
    guide.style.gridTemplateRows = `repeat(${verticalCellCount}, 1fr)`;

    for (let i = 0; i < horizontalCellCount * verticalCellCount; i++) {
      guide.insertAdjacentHTML("beforeend", "<div></div>")
    }
  }
}

function requestNewCanvasFromServer() {
  const msg = {
    clear: false,
    newCanvasRequested: true
  };
  sendMessageToServer(JSON.stringify(msg));
  if (!disconnectedToastVisible) Toastify({
    text: "Creating new canvas...",
    duration: 3000,
    gravity: "top", // `top` or `bottom`
    position: "left", // `left`, `center` or `right`
    style: {
      boxShadow: 'none',
      background: "#2d6c1a",
      borderRadius: '7px',
    }
  }).showToast();
}

function requestNextCanvasFromServer() {
  const msg = {
    clear: false,
    newCanvasRequested: false,
    nextCanvasRequested: true
  };
  sendMessageToServer(JSON.stringify(msg));
  if (!disconnectedToastVisible) Toastify({
    text: "Fetching next canvas...",
    duration: 2000,
    gravity: "top", // `top` or `bottom`
    position: "left", // `left`, `center` or `right`
    style: {
      boxShadow: 'none',
      background: "#2d6c1a",
      borderRadius: '7px',
    }
  }).showToast();
}

function requestDeleteCanvasFromServer() {
  const yes = confirm("Are you sure you wish to delete the current canvas?");
  if (!yes) return;
  const msg = {
    clear: false,
    newCanvasRequested: false,
    nextCanvasRequested: false,
    deleteCanvasRequested: true
  };
  sendMessageToServer(JSON.stringify(msg));
  if (!disconnectedToastVisible) Toastify({
    text: "Deleting canvas...",
    duration: 3000,
    gravity: "top", // `top` or `bottom`
    position: "left", // `left`, `center` or `right`
    style: {
      boxShadow: 'none',
      background: "#2d6c1a",
      borderRadius: '7px',
    }
  }).showToast();
}

/**
 * Sends a websocket message to the server indicating the pixel change.
 */
function sendPixelChangeToServer(cellx, celly) {
  const msg = {
    clear: false,
    newCanvasRequested: false,
    nextCanvasRequested: false,
    currentCanvasPath: false,
    pixelOn: !eraserOn,
    x: Math.floor(cellx / canvasMultiplier),
    y: Math.floor(celly / canvasMultiplier),
    size: brushSize
  };
  sendMessageToServer(JSON.stringify(msg));
}

/**
 * Bresenham's Line Algorithm Implementation from:
 * https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
 */
function computeIntegerPointsOnLine(x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  let points = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = Math.sign(x1 - x0);
  let sy = Math.sign(y1 - y0);
  let err = dx + dy;

  while (true) {
    points.push({ x: x0, y: y0 });
    if ((x0 == x1) && (y0 == y1)) break;
    const e2 = 2 * err;
    if (e2 >= dy) { 
      if (x0 == x1) break; 
      err += dy; 
      x0 += sx;
    }
    if (e2 <= dx) { 
      if (y0 == y1) break; 
      err += dx; 
      y0 += sy; 
    }
  }

  return points;
}

/**
 * Used to store input position when input is first touched or clicked to allow for interpolation.
 */
let x = 0;
let y = 0;

/**
 * Sets an x,y pixel using the currently selected brush size and eraser settings.
 */
function fillCell(cellx, celly) {
  sendPixelChangeToServer(cellx, celly);
  if (eraserOn) drawing.fillStyle = "#242526";
  else drawing.fillStyle = "#FFFFFF";
  drawing.fillRect(cellx, celly, cellSideLength, cellSideLength);
}

function mouseDown(e) {
  const canvasBoundingRect = canvas.getBoundingClientRect();
  x = e.clientX - canvasBoundingRect.left;
  y = e.clientY - canvasBoundingRect.top;
  isDrawing = true; 
  mouseMoved(e);
}

function mouseMoved(e) {
  if (isDrawing) {
    const canvasBoundingRect = canvas.getBoundingClientRect();
    let newX = e.clientX - canvasBoundingRect.left;
    let newY = e.clientY - canvasBoundingRect.top;
    inputMoved(x,y, newX, newY);
    x = newX;
    y = newY;
  }
}

function mouseUp(e) {
  if (isDrawing) {
    const canvasBoundingRect = canvas.getBoundingClientRect();
    let newX = e.clientX - canvasBoundingRect.left;
    let newY = e.clientY - canvasBoundingRect.top;
    inputMoved(x, y, newX, newY);
    x = newX;
    y = newY;
    isDrawing = false;
  } 
}

function touchStart(e) {
  // Prevent scrolling during canvas touch events.
  e.preventDefault();
  if (e.touches.length > 1) return;
  const canvasBoundingRect = canvas.getBoundingClientRect();
  x = e.touches[0].clientX - canvasBoundingRect.left;
  y = e.touches[0].clientY - canvasBoundingRect.top;
  isDrawing = true; 
  touchMoved(e);
}

function touchMoved(e) {
  if (e.touches.length > 1) return;
  if (isDrawing) {
    const canvasBoundingRect = canvas.getBoundingClientRect();
    let newX = e.touches[0].clientX - canvasBoundingRect.left;
    let newY = e.touches[0].clientY - canvasBoundingRect.top;
    inputMoved(x, y, newX, newY);
    x = newX;
    y = newY;
  }
}

function touchEnd(e) {
  if (e.touches.length > 1) return;
  if (isDrawing) {
    const canvasBoundingRect = canvas.getBoundingClientRect();
    let newX = e.touches[0].clientX - canvasBoundingRect.left;
    let newY = e.touches[0].clientY - canvasBoundingRect.top;
    inputMoved(x, y, newX, newY);
    x = newX;
    y = newY;
    isDrawing = false;
  } 
}  

/**
 * Called by touchMoved and mouseMoved event handlers.
 */
function inputMoved(x1, y1, x2, y2) {
  let points = computeIntegerPointsOnLine(x1, y1, x2, y2);
  points.forEach(point => {
    const cellX = Math.floor(point.x / cellSideLength) * cellSideLength;
    const cellY = Math.floor(point.y / cellSideLength) * cellSideLength;
    if (cellX != lastX || cellY != lastY || eraserStateChanged) {
      eraserStateChanged = false;
      fillCell(cellX, cellY);
      lastX = cellX;
      lastY = cellY;
    }
  });
}

function clearCanvas() {
  const yes = confirm("Are you sure you wish to clear the current canvas?");
  if (!yes) return;
  drawing.fillStyle = "#242526";
  drawing.fillRect(0, 0, canvas.width, canvas.height);
  const msg = {
    clear: true,
  };
  sendMessageToServer(JSON.stringify(msg));
  if (!disconnectedToastVisible) Toastify({
    text: "Cleared canvas!",
    duration: 3000,
    gravity: "top", // `top` or `bottom`
    position: "left", // `left`, `center` or `right`
    style: {
      boxShadow: 'none',
      background: "#2d6c1a",
      borderRadius: '7px',
    }
  }).showToast();
}

/**
 * Handle brush size changes and recalculate and apply updated scale values and pixel grid guidelines.
 */
function brushChanged(e) {
  brushSize = parseInt(e.target.value);
  horizontalCellCount = virtualDisplayWidth / brushSize;
  verticalCellCount = virtualDisplayHeight / brushSize;
  cellSideLength = canvas.width / horizontalCellCount;
  setupGridGuides();
}

function eraserToggled(e) {
  if (eraserOn) eraserOn = false;
  else eraserOn = true;
  eraserStateChanged = true;
}

function downloadCanvas() {
  let dataURL = canvas.toDataURL("image/png");
  let a = document.createElement('a');
  a.href = dataURL
  a.download = "img";
  a.click();
}

canvas.addEventListener("touchstart", touchStart, {passive: false});
canvas.addEventListener("touchend", touchEnd, {passive: false});
canvas.addEventListener("touchcancel", touchEnd, {passive: false});
canvas.addEventListener("touchmove", touchMoved, {passive: false});

canvas.addEventListener("mousemove", mouseMoved);
canvas.addEventListener("mousedown", mouseDown);
canvas.addEventListener("mouseup", mouseUp);
canvas.addEventListener("mouseout", mouseUp);

brushSizeSelector.addEventListener('change', brushChanged);
eraserToggle.addEventListener('change', eraserToggled);
clearButton.addEventListener("click", clearCanvas);

document.getElementById('downloadButton').addEventListener('click', downloadCanvas)
document.getElementById('imageUpload').addEventListener('change', uploadImageToServer);
document.getElementById('newCanvasButton').addEventListener('click', requestNewCanvasFromServer);
document.getElementById('nextCanvasButton').addEventListener('click', requestNextCanvasFromServer);
document.getElementById('deleteCanvasButton').addEventListener('click', requestDeleteCanvasFromServer);


document.getElementById('imageUploadButton').addEventListener('click', function() {
  document.getElementById('imageUpload').click();
})

canvas.addEventListener("dragover", function(e) {
  e.preventDefault();
})

canvas.addEventListener("drop", function(e) {
  e.preventDefault();
  document.getElementById('imageUpload').files = e.dataTransfer.files;
  uploadImageToServer(e);
})

// Connect to the server.
initWebSocket();