var express = require("express");
var methodOverride = require("method-override");
var app = express();
var TBoard = require("sirtet").Board;
var parseCookie = express.cookieParser("some secret");
var MemoryStore = express.session.MemoryStore;
var middleware = require("./middleware");
var routes = require("./routes");
var server = app.listen(3000);
var speed = 310;
var store = new MemoryStore();
var WebSocketServer = require("ws").Server;
var webSocketServer;
const Readline = require("@serialport/parser-readline");
const SerialPort = require("serialport");
var comport;
var port;
var parser;
var newport;
SerialPort.list().then(function (ports) {
  ports.forEach(function (ports) {
    if (
      ports.pnpId.includes("VID_10C4&PID_EA60") ||
      ports.pnpId.includes("VID_1A86&PID_7523")
    ) {
      comport = ports.path;
      console.log("PlayComputer Connected at :", comport);
      console.log("Visit 'http://localhost:3000' on your browser");
      newport = new SerialPort(comport, {
        baudRate: 115200,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        flowControl: false,
      });
      parser = newport.pipe(new Readline({ delimiter: "\r\n" }));
    }
  });
  if (!newport) {
    console.log("PlayComputer not connected \nConnect and reopen again");
  }
});
app.set("view engine", "ejs");

app.use(express.json({ keepExtensions: true, uploadDir: "/tmp" }));
app.use(methodOverride());
app.use(parseCookie);
app.use(express.session({ store: store, secret: "some secret" }));
app.use(express.static(__dirname + "/public"));

// Sessions
app.get("/session/new", routes.session.new);
app.post("/session", routes.session.create);
app.delete("/session", routes.session.delete);

// Game
app.get("/", middleware.requiresUser, routes.board.index);
app.get("/board", middleware.requiresUser, routes.board.index);

webSocketServer = new WebSocketServer({ server: server });

function sendBoard(ws, board) {
  ws.send(
    JSON.stringify({
      type: "board",
      data: board.cells,
      width: board.width,
      height: board.height,
    })
  );
}

function sendShape(ws, shape, messageType) {
  ws.send(
    JSON.stringify({
      type: messageType,
      colour: shape.colour,
      x: shape.x,
      y: shape.y,
      data: shape.data,
      name: shape.name,
    })
  );
}

function handleMove(ws, board, move) {
  var shape = board.currentShape;

  if (move === "right") {
    shape.moveRight();
  } else if (move === "left") {
    shape.moveLeft();
  } else if (move === "down") {
    shape.moveDown();
  } else if (move === "rotate" && board.checkRotation()) {
    shape.rotate();
  }

  sendShape(ws, board.currentShape, "shape");
}

webSocketServer.on("connection", function (ws) {
  console.log("new client connected");
  // TODO: I might move this
  var Tboard = new TBoard(14, 20);
  var boardUpdateId;

  sendBoard(ws, Tboard);

  Tboard.on("shape", function () {
    sendBoard(ws, Tboard);
  });
  parser.on("data", async function (data) {
    data = await data.toString("utf-8").trim();
    //console.log("movement bit from esp32:", data);
    if (data == "ok") {
      parser.write("ok", function () {
        // console.log("received ok from esp32");
      });
    } else if (data == "50") {
      // console.log("->");
      move = "right"; //right
      try {
        handleMove(ws, Tboard, move);
      } catch (err) {}
    } else if (data == "48") {
      //console.log("<-");
      move = "left"; //left
      try {
        handleMove(ws, Tboard, move);
      } catch (err) {}
    }
    if (data == "49") {
      //console.log("up/rotate");
      move = "rotate"; //rotate
      try {
        handleMove(ws, Tboard, move);
      } catch (err) {}
    }
  });

  Tboard.on("gameover", function () {
    ws.send(JSON.stringify({ type: "gameover" }));
  });

  Tboard.on("nextshape", function (shape) {
    sendShape(ws, shape, "nextshape");
  });

  sendShape(ws, Tboard.nextShape, "nextshape");

  boardUpdateId = setInterval(function () {
    if (!Tboard.running) return;

    Tboard.currentShape.moveDown();
    sendShape(ws, Tboard.currentShape, "shape");
  }, speed);

  ws.on("close", function () {
    clearInterval(boardUpdateId);
  });

  ws.on("message", function (data) {
    var message = JSON.parse(data);

    if (message.type === "move") {
      handleMove(ws, Tboard, message.move);
    } else {
      ws.send("Unknown command");
    }
  });
});
