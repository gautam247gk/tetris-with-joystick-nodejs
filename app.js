var express = require("express");
var app = express();
var TBoard = require("sirtet").Board;
var parseCookie = express.cookieParser("some secret");
var MemoryStore = express.session.MemoryStore;
var middleware = require("./middleware");
var routes = require("./routes");
var server = app.listen(process.env.PORT || 3000);
var Scores = require("./scores");
var scores = new Scores();
var speed = 310;
var store = new MemoryStore();
var WebSocketServer = require("ws").Server;
var webSocketServer;
var portid = require("./portid");
const SerialPort = require("serialport");
const port = new SerialPort(portid.port, {
  baudRate: 115200,
  dataBits: 8,
  parity: "none",
  stopBits: 1,
  flowControl: false,
});

app.set("view engine", "ejs");

app.use(express.bodyParser({ keepExtensions: true, uploadDir: "/tmp" }));
app.use(express.methodOverride());
app.use(parseCookie);
app.use(express.session({ store: store, secret: "some secret" }));
app.use(express.static(__dirname + "/public"));

// Sessions
app.get("/session/new", routes.session.new);
app.post("/session", routes.session.create);
app.delete("/session", routes.session.delete);

// Scores
app.get("/scores", routes.scores.index);

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
  port.write("start", function (err) {
    console.log("writing start to esp32");
    if (err) {
      return console.log("Error on write: ", err.message);
    }
  });

  var Tboard = new TBoard(14, 20);
  var boardUpdateId;
  port.write("ok", function () {
    console.log("writing first ok to esp32");
  });
  sendBoard(ws, Tboard);

  Tboard.on("shape", function () {
    sendBoard(ws, Tboard);
  });
  port.on("data", async function (data) {
    data = await data.toString("utf-8").trim();
    console.log(typeof data);
    console.log("movement from esp32:", data);
    if (data == "ok") {
      port.write("ok", function () {
        console.log("received ok from esp32");
      });
    } else if (data == "2") {
      console.log("->");
      move = "right"; //right
      handleMove(ws, Tboard, move);
    } else if (data == "0") {
      console.log("<-");
      move = "left"; //left
      handleMove(ws, Tboard, move);
    }
    if (data == "1") {
      console.log("up/rotate");
      move = "rotate"; //rotate
      handleMove(ws, Tboard, move);
    }
  });

  Tboard.on("score", function (score) {
    ws.send(JSON.stringify({ type: "score", value: score }));
  });

  Tboard.on("gameover", function () {
    parseCookie(ws.upgradeReq, null, function (err) {
      var sid = ws.upgradeReq.signedCookies["connect.sid"];

      store.get(sid, function (err, session) {
        if (err) console.error("Error loading session:", err);
        scores.save(
          { name: session.user.name, score: Tboard.score },
          function (err) {
            if (err) console.error("Error saving score:", err);
            ws.send(JSON.stringify({ type: "gameover" }));
            port.write("stop", function () {
              console.log("writing stop to esp32");
            });
          }
        );
      });
    });
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
