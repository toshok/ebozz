import readline from "readline-sync";
import chalk from "chalk";

const TextStyles = {
  Roman: 0,
  ReverseVideo: 1,
  Bold: 2,
  Italic: 4,
  FixedPitch: 8
};

const Colors = {
  Current: 0,
  Default: 1,
  Black: 2,
  Red: 3,
  Green: 4,
  Yellow: 5,
  Blue: 6,
  Magenta: 7,
  Cyan: 8,
  White: 9,
  Gray: 10
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

    this.colors = {
      0: {
        foreground: Colors.Default,
        background: Colors.Default
      }
    };
  }

  getInputFromUser(game, input_state) {
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
  }

  applyStyles(str) {
    if (this.textStyle & TextStyles.ReverseVideo) {
      str = chalk.inverse(str);
    }
    if (this.textStyle & TextStyles.Bold) {
      str = chalk.bold(str);
    }
    if (this.textStyle & TextStyles.Italic) {
      str = chalk.italic(str);
    }
    return str;
  }

  applyColors(str) {
    // background first
    const getChalkAccessor = (color, bg) => {
      const bgOrNot = (name, bg) => (bg ? `bg${name}` : name.toLowerCase());
      switch (color) {
        case Colors.Black:
          return bgOrNot("Black", bg);
        case Colors.Red:
          return bgOrNot("Red", bg);
        case Colors.Green:
          return bgOrNot("Green", bg);
        case Colors.Yellow:
          return bgOrNot("Yellow", bg);
        case Colors.Blue:
          return bgOrNot("Blue", bg);
        case Colors.Magenta:
          return bgOrNot("Magenta", bg);
        case Colors.Cyan:
          return bgOrNot("Cyan", bg);
        case Colors.White:
          return bgOrNot("White", bg);
        case Colors.Gray:
          // because why be consistent?  ugh, chalk.
          return bg ? "bgBrightBlack" : "gray";
        default:
          throw new Error("unrecognized color");
      }
    };

    if (this.colors[this.outputWindowId].background !== Colors.Default) {
      let accessor = getChalkAccessor(
        this.colors[this.outputWindowId].background,
        true
      );
      str = chalk[accessor](str);
    }
    if (this.colors[this.outputWindowId].foreground !== Colors.Default) {
      let accessor = getChalkAccessor(
        this.colors[this.outputWindowId].foreground,
        false
      );
      str = chalk[accessor](str);
    }

    return str;
  }

  print(game, str) {
    if (this.outputWindowId !== 0) {
      return;
    }
    str = this.applyStyles(str);
    str = this.applyColors(str);
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

  setTextColors(game, windowId, foreground, background) {
    let newColors = { foreground, background };
    if (newColors.foreground === Colors.Current) {
      newColors.foreground = this.colors[windowId].foreground;
    }
    if (newColors.background === Colors.Current) {
      newColors.background = this.colors[windowId].background;
    }
    this.colors[windowId] = newColors;
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
