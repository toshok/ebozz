import blessed from "blessed";

export default class BlessedScreen {
  constructor(log) {
    this.log = log;
    this.screen = blessed.screen({
      smartCSR: true
    });
    this.screen.title = "Ebozz";

    this.gameLog = blessed.log({
      parent: this.screen,
      border: "line",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%"
    });

    this.gameLog.focus();

    this.screen.key(["C-c"], function(_ch, _key) {
      this.screen.destroy();
      return process.exit(0);
    });

    this.screen.render();
  }

  getInputFromUser(_game, _input_state) {
    /*
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
    */
  }

  print(game, str) {
    this.gameLog.log(str);
    this.screen.render();
    //    process.stdout.write(str);
  }

  splitWindow(_game, _lines) {
    this.log.error("not implemented: console.js splitWindow");
  }

  setOutputWindow(_game, _windowId) {
    this.log.error("not implemented: console.js setOutputWindow");
  }

  getOutputWindow(_game) {
    this.log.error("not implemented: console.js getOutputWindow");
  }

  clearWindow(_game, _windowId) {
    this.log.error("not implemented: console.js clearWindow");
  }

  clearLine(_game, _value) {
    this.log.error("not implemented: console.js clearLine");
  }

  setCursorPosition(_game, _line, _column, _windowId) {
    this.log.error("not implemented: console.js setCursorPosition");
  }

  hideCursor(_game, _windowId) {
    this.log.error("not implemented: console.js hideCursor");
  }

  showCursor(_game, _windowId) {
    this.log.error("not implemented: console.js showCursor");
  }

  setBufferMode(_game, _style) {
    this.log.error("not implemented: console.js showBufferMode");
  }

  setTextStyle(_game, _style) {
    this.log.error("not implemented: console.js showTextStyle");
  }

  enableOutputStream(_game, _streamId, _table, _width) {
    this.log.error("not implemented: console.js enableOutputStream");
  }

  disableOutputStream(_game, _streamId, _table, _width) {
    this.log.error("not implemented: console.js disableOutputStream");
  }

  selectInputStream(_game, _streamId) {
    this.log.error("not implemented: console.js selectInputStream");
  }
}
