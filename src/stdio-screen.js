import readline from "readline-sync";
import chalk from "chalk";

const TextStyles = {
  Roman: 0,
  ReverseVideo: 1,
  Bold: 2,
  Italic: 4,
  FixedPitch: 8
};

const BufferModes = {
  NotBuffered: 0,
  Buffered: 1
};

export default class StdioScreen {
  constructor(log) {
    this.log = log;
    this.textStyle = TextStyles.Roman;
    this.outputWindowId = 0;
    this.bufferMode = BufferModes.Buffered;
  }

  getInputFromUser(game, input_state) {
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
  }

  print(game, str) {
    if (this.outputWindowId !== 0) {
      return;
    }
    if (this.textStyle & TextStyles.ReverseVideo) {
      str = chalk.inverse(str);
    }
    if (this.textStyle & TextStyles.Bold) {
      str = chalk.bold(str);
    }
    if (this.textStyle & TextStyles.Italic) {
      str = chalk.italic(str);
    }
    process.stdout.write(str);
  }

  splitWindow(game, lines) {
    this.log.debug(`not implemented: console.js splitWindow(${lines})`);
  }

  setOutputWindow(game, windowId) {
    this.outputWindowId = windowId;
  }

  getOutputWindow(_game) {
    return this.outputWindowId;
  }

  clearWindow(game, windowId) {
    this.log.debug(`not implemented: console.js clearWindow(${windowId})`);
  }

  clearLine(game, value) {
    this.log.debug(`not implemented: console.js clearLine(${value})`);
  }

  setCursorPosition(game, line, column, windowId) {
    this.log.debug(
      `not implemented: console.js setCursorPosition(${line}, ${column}, ${windowId})`
    );
  }

  hideCursor(game, windowId) {
    this.log.debug(`not implemented: console.js hideCursor(${windowId})`);
  }

  showCursor(game, windowId) {
    this.log.debug(`not implemented: console.js showCursor(${windowId})`);
  }

  setBufferMode(game, mode) {
    this.bufferMode = mode;
  }

  setTextStyle(game, style) {
    this.textStyle = style;
  }

  enableOutputStream(game, streamId, table, width) {
    this.log.debug(
      `not implemented: console.js enableOutputStream(${streamId}, ${table}, ${width})`
    );
  }

  disableOutputStream(game, streamId, table, width) {
    this.log.debug(
      `not implemented: console.js disableOutputStream(${streamId}, ${table}, ${width})`
    );
  }

  selectInputStream(game, streamId) {
    this.log.debug(
      `not implemented: console.js selectInputStream(${streamId})`
    );
  }
}
