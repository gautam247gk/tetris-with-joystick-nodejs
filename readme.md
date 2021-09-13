### Tetris with arduino and joystick using johnny five

To run this project, do the following:

Connect your arduino board to the usb port.
Go to Tools -> Board and make sure the device you have is correctly selected.
Then go to File -> Examples -> Firmata and choose StandardFirmataPlus
Click the right arrow icon on the toolbar to compile and load the program on the Arduino board:
connect 4 wires to the joystick and Make sure the pins in the joystick are as follows :

1. Connect pin #1 and #2 to GND and +5V.
2. Pin #3 (x) goes to A0 and pin #4 (y) goes to A1.

Now run the following commands

```
npm install
npm start
```

Then visit <http://localhost:3000> in a browser.
