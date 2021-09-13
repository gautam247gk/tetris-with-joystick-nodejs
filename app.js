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
const { Board, Joystick } = require("johnny-five");
const board = new Board();

app.set("view engine", "ejs");

app.use(express.bodyParser({ keepExtensions: true, uploadDir: "/tmp" }));
app.use(express.methodOverride());
app.use(parseCookie);
app.use(express.session({ store: store, secret: "some secret" }));
app.use(express.static(__dirname + "/public"));

// Sessions
app.get("/session/new", routes.session.new);
app.post("/session", routes.session.create);
app.del("/session", routes.session.delete);

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
  // TODO: I might move this
  var Tboard = new TBoard(14, 20);
  var boardUpdateId;

  sendBoard(ws, Tboard);

  Tboard.on("shape", function () {
    sendBoard(ws, Tboard);
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
          { name: session.user.name, score: board.score },
          function (err) {
            if (err) console.error("Error saving score:", err);
            ws.send(JSON.stringify({ type: "gameover" }));
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
  //<--------------------------------->
  board.on("ready", () => {
    const joystick = new Joystick({
      pins: ["A0", "A1"],
    });
    joystick.on("change", function () {
      if (this.x > 0.5) {
        console.log("->");
        move = "right"; //right
      }
      if (this.x < -0.5) {
        console.log("<-");
        move = "left"; //left
      }

      if (this.y > 0.5) {
        console.log("down"); //down
        move = "down";
      }
      if (this.y < -0.5) {
        console.log("up");
        move = "rotate"; //rotate
      }
      handleMove(ws, Tboard, move);
    });
  });
  //
  ws.on("message", function (data, flags) {
    var message = JSON.parse(data);

    if (message.type === "move") {
      handleMove(ws, Tboard, message.move);
    } else {
      ws.send("Unknown command");
    }
  });
});
