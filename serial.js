const SerialPort = require("serialport");
const port = new SerialPort("/dev/tty-usbserial1", {
  baudRate: 15200,
});

port.on("data", function (data) {
  console.log("Data:", data);
});
