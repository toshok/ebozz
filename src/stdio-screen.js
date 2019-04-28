import readline from "readline-sync";

export default class StdioScreen {
  constructor(log) {
    this.log = log;
  }

  getInputFromUser(game, input_state) {
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
  }

  print(game, str) {
    process.stdout.write(str);
  }

  splitWindow(game, lines) {
    this.log.error("not implemented: console.js splitWindow");
  }

  setOutputWindow(game, windowId) {
    this.log.error("not implemented: console.js setOutputWindow");
  }

  getOutputWindow(game) {
    this.log.error("not implemented: console.js getOutputWindow");
  }

  clearWindow(game, windowId) {
    this.log.error("not implemented: console.js clearWindow");
  }

  clearLine(game, value) {
    this.log.error("not implemented: console.js clearLine");
  }

  setCursorPosition(game, line, column, windowId) {
    this.log.error("not implemented: console.js setCursorPosition");
  }

  hideCursor(game, windowId) {
    this.log.error("not implemented: console.js hideCursor");
  }

  showCursor(game, windowId) {
    this.log.error("not implemented: console.js showCursor");
  }

  setBufferMode(game, style) {
    this.log.error("not implemented: console.js showBufferMode");
  }

  setTextStyle(game, style) {
    this.log.error("not implemented: console.js showTextStyle");
  }

  enableOutputStream(game, streamId, table, width) {
    this.log.error("not implemented: console.js enableOutputStream");
  }

  disableOutputStream(game, streamId, table, width) {
    this.log.error("not implemented: console.js disableOutputStream");
  }

  selectInputStream(game, streamId) {
    this.log.error("not implemented: console.js selectInputStream");
  }
}
