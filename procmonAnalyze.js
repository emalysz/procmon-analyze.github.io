import {parseCSV} from "./parseCSV.js"
import renderer from "./renderer.js"

const BACKGROUND_DEPTH = 0.9;
const TRACK_GUTTER_DEPTH = 0.8;
const FOREGROUND_DEPTH = 0.7;

const csvInput = document.getElementById("csvfile");
const tooltip = document.getElementById("tooltip");
const timeline = document.getElementById("timeline");
const canvas = document.getElementById("canvas");
// const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth * 0.5;
canvas.height = window.innerHeight - 16;

let headerMap = {
  "Time of Day": "time",
  "Process Name": "processName",
  "PID": "pid",
  "Detail": "detail",
  "Operation": "operation",
  "Path": "path",
  "Duration": "duration",
};

function parseTimeString(str) {
  let match = /([0-9]+):([0-9]+):([0-9.]+)/.exec(str);
  if (!match) {
    throw new Error("Failed to parse time: " + str);
  }

  let hours = parseInt(match[1]);
  let minutes = parseInt(match[2]);
  let seconds = parseFloat(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

let colors = [
  "#4736fc",
  "#e4ba6e",
  "#623b1a",
  "#8fb0e9",
  "#857ebb",
  "#7fcbd7",
  "#427975",
  "#72b37e",
  "#4736fc",
  "#e4ba6e",
  "#623b1a",
  "#8fb0e9",
  "#857ebb",
  "#7fcbd7",
  "#427975",
  "#72b37e",
  "#4736fc",
  "#e4ba6e",
  "#623b1a",
  "#8fb0e9",
  "#857ebb",
  "#7fcbd7",
  "#427975",
  "#72b37e",
  "#6f6add",
  "#584081",
  "#cb6b6f",
  "#6f6add",
  "#4736fc",
  "#e4ba6e",
  "#623b1a",
  "#8fb0e9",
  "#857ebb",
  "#7fcbd7",
  "#427975",
  "#72b37e",
  "#6f6add",
  "#584081",
  "#cb6b6f",
  "#6f6add",
  "#4736fc",
  "#e4ba6e",
  "#623b1a",
  "#8fb0e9",
  "#857ebb",
  "#7fcbd7",
  "#427975",
  "#72b37e",
  "#6f6add",
  "#584081",
  "#cb6b6f",
  "#6f6add",
];

let opColors = {};
let gState = null;

async function drawData(data) {
  document.getElementById("chooserWrapper").style.display = "none";

  let tracks = [];
  let minTime = Number.MAX_VALUE;
  let maxTime = -1;

  data = data.map(row => {
    let operation = row.operation;
    let path = row.path;
    let pid = row.pid;
    let detail = row.detail;
    let processName = row.processName;
    let start = parseTimeString(row.time);
    let duration = parseFloat(row.duration);
    return {
      operation, path, pid, start, duration, detail, processName
    };
  }).filter(row => row.duration > 0 || row.operation == "Process Start");
  data.sort((lhs, rhs) => lhs.start - rhs.start);

  let totalTimeByOperation = {};

  for (let row of data) {
    let { operation, path, pid, start, duration, detail, processName } = row;
    let end = start + duration;

    if (start < minTime) {
      if (minTime != Number.MAX_VALUE) {
        throw new Error("Data should be ordered by start time.");
      }
      minTime = start;
    }
    if (end > maxTime) {  
      maxTime = end;
    }

    let track = null;

    if (!totalTimeByOperation[operation]) {
      totalTimeByOperation[operation] = 0;
    }

    totalTimeByOperation[operation] += duration;

    for (let candidate of tracks) {
      if (operation == candidate.operation) {
        let lastTimeSlice = candidate.entries[candidate.entries.length - 1];
        if (start > lastTimeSlice.end) {
          track = candidate;
          break;
        } else if (path == lastTimeSlice.path) {
          lastTimeSlice.end = end;
          track = candidate;
          break;
        }
      }
    }

    if (!track) {
      track = {operation, entries: []};
      tracks.push(track);
    }

    if (!opColors[operation]) {
      if (!colors.length) {
        throw new Error("Not enough colors in array.");
      }
      opColors[operation] = colors.pop();
    }
    let entry = {start, end, path, pid, detail, processName, color: opColors[operation]};
    track.entries.push(entry);
  }


  tracks.sort((lhs, rhs) => totalTimeByOperation[rhs.operation] - totalTimeByOperation[lhs.operation]);

  let totalTime = maxTime - minTime;
  let trackWidth = canvas.width / tracks.length;
  let pixelsPerSecond = canvas.height / totalTime;
  let scale = 10;
  let scrollOffset = 0;
  gState = {
    trackWidth,
    minTime,
    maxTime,
    pixelsPerSecond,
    tracks,
    totalTime,
    scale,
    scrollOffset,
    rendererScale: 1,
    rendererScroll: 0,
    mouseX: 0,
    mouseY: 0,
    timelineIndicators: [],
  };

  renderer.clearAll();
  drawBackground();
  drawForeground();
  renderer.draw();
}

function drawBackground() {
  let {trackWidth, minTime, maxTime, pixelsPerSecond, tracks, totalTime, scale, scrollOffset} = gState;

  pixelsPerSecond *= scale;

  let timelineScale =
    pixelsPerSecond < 1000 ? 1 :
    pixelsPerSecond < 10000 ? 0.1 :
    pixelsPerSecond < 100000 ? 0.01 : 0.001;

  for (let i = 0; i < Math.ceil(totalTime / timelineScale); i++) {
    let color = (i & 1) ? "#ffffff" : "#fafafa";
    renderer.pushRect(color,
                      0,
                      timelineScale * pixelsPerSecond * (i - scrollOffset / timelineScale),
                      canvas.width,
                      timelineScale * pixelsPerSecond,
                      BACKGROUND_DEPTH);
  }

  let lastOperation = null;
  for (let i = 0; i < tracks.length; i++) {
    let track = tracks[i];
    if (track.operation != lastOperation) {
      let color = "#efefef";
      renderer.pushRect(color,
                        i * trackWidth,
                        -canvas.height,
                        trackWidth * 0.1,
                        canvas.height * 3,
                        TRACK_GUTTER_DEPTH);
      lastOperation = track.operation;
    }
  }

  gState.timelineIndicators = [];
  timeline.textContent = "";
  let printSeconds = timelineScale == 1;
  if (timelineScale == 1) {
    for (let i = 0; i < Math.floor(totalTime); i++) {
      let div = document.createElement("div");
      div.style.position = "fixed";
      div.style.left = `${canvas.width}px`;
      let offset = (i - scrollOffset) * pixelsPerSecond;
      div.style.top = `${offset}px`;
      div.textContent = `${i}s`;
      timeline.appendChild(div);
      gState.timelineIndicators.push({div, offset});
    }
  } else {
    for (let i = 0; i < Math.floor(totalTime / timelineScale); i++) {
      let div = document.createElement("div");
      div.style.position = "fixed";
      div.style.left = `${canvas.width}px`;
      let offset = (i * timelineScale - scrollOffset) * pixelsPerSecond;
      div.style.top = `${offset}px`;
      div.textContent = `${Math.round(i * timelineScale * 1000)}ms`;
      timeline.appendChild(div);
      gState.timelineIndicators.push({div, offset});
    }
  }
}

function drawForeground() {
  let {trackWidth, minTime, maxTime, pixelsPerSecond, tracks, totalTime, scale, scrollOffset} = gState;

  pixelsPerSecond *= scale;

  let maxVisualStart = window.innerHeight * pixelsPerSecond + minTime;

  for (let i = 0; i < tracks.length; i++) {
    let track = tracks[i];
    let currentPixel = -1;
    let currentPixelFill = 0;
    for (let entry of track.entries) {
      if ((entry.start - scrollOffset) > maxVisualStart ||
          (entry.end - scrollOffset) < 0) {
        break;
      }

      function maybePopLastPixel() {
        if (currentPixel != -1 && currentPixelFill > 0.1) {
          renderer.pushRect(entry.color,
                            i * trackWidth,
                            currentPixel,
                            trackWidth,
                            1,
                            FOREGROUND_DEPTH,
                            Math.min(1, currentPixelFill));
          currentPixel = -1;
          currentPixelFill = 0;
        }
      }

      let startRelative = entry.start - minTime - scrollOffset;
      let endRelative = entry.end - minTime - scrollOffset;
      let startPixels = startRelative * pixelsPerSecond;
      let startPixel = Math.floor(startPixels);
      let endPixels = endRelative * pixelsPerSecond;
      let endPixel = Math.floor(endPixels);
      let durationPixels = endPixels - startPixels;
      if (true) {
        renderer.pushRect(entry.color,
                          i * trackWidth,
                          startPixels,
                          trackWidth,
                          endPixels - startPixels,
                          FOREGROUND_DEPTH);
      } else {
        if (startPixel == endPixel) {
          if (startPixel != currentPixel) {
            maybePopLastPixel();
          }
          currentPixel = startPixel;
          currentPixelFill += durationPixels;
        } else {
          let pixelAfterStart = startPixel + 1;
          let startPixelFill = pixelAfterStart - startPixels;
          let pixelAfterEnd = endPixel + 1;
          let endPixelFill = pixelAfterEnd - endPixels;

          if (startPixel == currentPixel) {
            currentPixelFill += startPixelFill;
            maybePopLastPixel();
          } else {
            maybePopLastPixel();
            renderer.pushRect(entry.color,
                              i * trackWidth,
                              startPixel,
                              trackWidth,
                              1,
                              FOREGROUND_DEPTH,
                              startPixelFill);
            if (endPixel != pixelAfterStart) {
              renderer.pushRect(entry.color,
                                i * trackWidth,
                                pixelAfterStart,
                                trackWidth,
                                endPixel - pixelAfterStart,
                                FOREGROUND_DEPTH);
            }

            currentPixel = endPixel;
            currentPixelFill = endPixelFill;
          }
        }
      }
    }
  }
}

async function readFileContents() {
  let file = csvInput.files[0];
  if (file) {
    let reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    let text = await new Promise((resolve, reject) => {
      reader.onload = e => {
        resolve(e.target.result);
      };
      reader.onerror = e => {
        reject("error reading file");
      };
    });

    let data = parseCSV(text).map(row => Object.entries(row).reduce((acc,[key,val]) => {
      acc[headerMap[key]] = val;
      return acc;
    }, {}));

    await drawData(data);
  }
};

function translateTimeline() {
  let {timelineIndicators, rendererScroll, rendererScale} = gState;
  for (let indicator of timelineIndicators) {
    indicator.div.style.top = `${indicator.offset + rendererScroll * rendererScale}px`;
  }
}

function handleMouseMove(e) {
  if (gState && gState.middleMouseDown) {
    let {
      trackWidth,
      minTime,
      maxTime,
      pixelsPerSecond,
      scale,
      scrollOffset,
      tracks,
      mouseX,
      mouseY,
    } = gState;

    pixelsPerSecond *= scale;

    let x = e.pageX;
    let y = e.pageY;
    let dx = e.movementX;
    let dy = e.movementY;

    gState.mouseX = x;
    gState.mouseY = y;

    let newScrollOffset = scrollOffset - dy / pixelsPerSecond;
    gState.scrollOffset = Math.max(0, newScrollOffset);
    gState.rendererScroll += dy;

    renderer.translate(0, gState.rendererScroll);
    renderer.draw();
    translateTimeline();
    scheduleRedraw();
  } else if (gState) {
    tooltip.textContent = "";

    let {trackWidth, minTime, maxTime, pixelsPerSecond, scale, tracks, scrollOffset} = gState;

    pixelsPerSecond *= scale;

    let x = e.pageX;
    let y = e.pageY;

    gState.mouseX = x;
    gState.mouseY = y;

    let trackIndex = Math.floor(x / trackWidth);
    if (trackIndex < tracks.length) {
      let track = tracks[trackIndex];
      tooltip.style.left = `${x + 8}px`;
      tooltip.style.top = `${y + 8}px`;

      let time = minTime + y / pixelsPerSecond + scrollOffset;
      let hoveredEntry = null;

      let minDistance = 0.001; // 1 millisecond minimum distance
      for (let entry of track.entries) {
        let distance;
        if (entry.start < time && entry.end > time) {
          minDistance = 0;
          hoveredEntry = entry;
          break;
        } else if (entry.start > time) {
          distance = entry.start - time;
        } else if (entry.end < time) {
          distance = time - entry.end;
        }

        if (distance < minDistance) {
          minDistance = distance;
          hoveredEntry = entry;
        }
      }

      let text = "";
      text += `Op: ${track.operation}\n`;
      if (hoveredEntry) {
        text += `Path: ${hoveredEntry.path}\n`;
        text += `PID: ${hoveredEntry.pid}\n`;
        text += `Detail: ${hoveredEntry.detail}\n`;
        text += `Process Name: ${hoveredEntry.processName}\n`;
        text += `Duration: ${((hoveredEntry.end - hoveredEntry.start) * 1000).toFixed(3)}ms\n`;
      }

      let lines = text.split("\n");
      for (let line of lines) {
        let div = document.createElement("div");
        div.textContent = line;
        tooltip.appendChild(div);
      }
    }
  }
};


let drawForegroundTimeout = null;
function scheduleRedraw() {
  if (drawForegroundTimeout) {
    clearTimeout(drawForegroundTimeout);
  }
  drawForegroundTimeout = setTimeout(() => {
    gState.rendererScale = 1;
    gState.rendererScroll = 0;
    renderer.scale(1, 1);
    renderer.translate(0, 0);
    renderer.clearAll();
    drawBackground();
    drawForeground();
    renderer.draw();
  }, 250);
}

function handleMouseWheel(event) {
  if (gState) {
    event.preventDefault();

    let {
      trackWidth,
      minTime,
      maxTime,
      pixelsPerSecond,
      scale,
      scrollOffset,
      tracks,
      mouseX,
      mouseY
    } = gState;

    pixelsPerSecond *= scale;

    let scaleFactor = 1 + event.deltaY * -0.05;

    let windowTopInPixels = scrollOffset * pixelsPerSecond;
    let windowCenterInPixels = windowTopInPixels + canvas.height / 2;
    let mousePositionAbsolute = windowTopInPixels + mouseY;
    let newMousePositionAbsolute = scaleFactor * mousePositionAbsolute;
    let newWindowTopInPixels = newMousePositionAbsolute - mouseY;
    let newScrollOffset = Math.max(0, newWindowTopInPixels / (pixelsPerSecond * scaleFactor));

    gState.scale *= scaleFactor;
    gState.rendererScale *= scaleFactor;
    gState.scrollOffset = newScrollOffset;
    gState.rendererScroll = (gState.rendererScale - 1) * (canvas.height / 2 - mouseY) / gState.rendererScale;

    renderer.scale(1, gState.rendererScale);
    renderer.translate(0, gState.rendererScroll);
    renderer.draw();
    translateTimeline();
    scheduleRedraw();
  }
}

function handleMouseDown(event) {
  if (gState && event && (event.which == 2 || event.button == 4 )) {
    event.preventDefault();
    gState.middleMouseDown = true;
  }
}

function handleMouseUp(event) {
  if (gState && event && (event.which == 2 || event.button == 4 )) {
    event.preventDefault();
    gState.middleMouseDown = false;
  }
}

csvInput.addEventListener("change", readFileContents);
canvas.addEventListener("mousemove", handleMouseMove);
document.addEventListener("wheel", handleMouseWheel, {passive: false});
document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);

renderer.startup();
