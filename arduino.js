const { Board, Joystick } = require("johnny-five");
const board = new Board();
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
  });
});
