import * as readline from "readline-sync";
import chalk from "chalk";
import Log from "../log.js";
import type { InputState } from "../types.js";
import {
  ScreenBase,
  Color,
  TextStyle,
  BufferMode,
  ScreenSize,
  Capabilities,
} from "../Screen.js";
import type Game from "../Game.js";

export default class StdioScreen extends ScreenBase {
  private textStyle: TextStyle;
  private outputWindowId: number;
  private bufferMode: BufferMode;
  private colors: Record<number, { foreground: Color; background: Color }>;

  constructor(log: Log) {
    super(log, "StdioScreen");
    this.textStyle = TextStyle.Roman;
    this.outputWindowId = 0;
    this.bufferMode = BufferMode.Buffered;

    this.colors = {
      0: {
        foreground: Color.Default,
        background: Color.Default,
      },
    };
  }

  getCapabilities(): Capabilities {
    return {
      hasColors: true,
      hasBold: true,
      hasItalic: false,
      hasReverseVideo: true,
      hasFixedPitch: false,
      hasSplitWindow: false,
      hasDisplayStatusBar: false,
      hasPictures: false,
      hasSound: false,
      hasTimedKeyboardInput: false,
    };
  }

  getInputFromUser(game: Game, input_state: InputState) {
    const input = readline.question("");
    game.continueAfterUserInput(input_state, input);
  }

  getKeyFromUser(game: Game, input_state: InputState) {
    const input = readline.keyIn("", { hideEchoBack: true });
    game.continueAfterUserInput(input_state, input);
  }

  applyStyles(str: string) {
    if (this.textStyle & TextStyle.ReverseVideo) {
      str = chalk.inverse(str);
    }
    if (this.textStyle & TextStyle.Bold) {
      str = chalk.bold(str);
    }
    if (this.textStyle & TextStyle.Italic) {
      str = chalk.italic(str);
    }
    return str;
  }

  applyColors(str: string) {
    const chalkedString = (str: string, color: number, bg: boolean) => {
      switch (color) {
        case Color.Black:
          return bg ? chalk.bgBlack(str) : chalk.black(str);
        case Color.Red:
          return bg ? chalk.bgRed(str) : chalk.red(str);
        case Color.Green:
          return bg ? chalk.bgGreen(str) : chalk.green(str);
        case Color.Yellow:
          return bg ? chalk.bgYellow(str) : chalk.yellow(str); // bgOrNot("Yellow", bg);
        case Color.Blue:
          return bg ? chalk.bgBlue(str) : chalk.blue(str);
        case Color.Magenta:
          return bg ? chalk.bgMagenta(str) : chalk.magenta(str);
        case Color.Cyan:
          return bg ? chalk.bgCyan(str) : chalk.cyan(str);
        case Color.White:
          return bg ? chalk.bgWhite(str) : chalk.white(str);
        case Color.Gray:
          // because why be consistent?  ugh, chalk.
          return bg ? chalk.bgBlackBright(str) : chalk.gray(str);
        default:
          throw new Error("unrecognized color");
      }
    };

    if (this.colors[this.outputWindowId].background !== Color.Default) {
      str = chalkedString(
        str,
        this.colors[this.outputWindowId].background,
        true
      );
    }
    if (this.colors[this.outputWindowId].foreground !== Color.Default) {
      str = chalkedString(
        str,
        this.colors[this.outputWindowId].foreground,
        false
      );
    }

    return str;
  }

  print(game: Game, str: string) {
    if (this.outputWindowId !== 0) {
      return;
    }
    str = this.applyStyles(str);
    str = this.applyColors(str);
    process.stdout.write(str);
  }

  setOutputWindow(game: Game, windowId: number) {
    this.outputWindowId = windowId;
  }

  getOutputWindow(_game: Game): number {
    return this.outputWindowId;
  }

  setBufferMode(game: Game, mode: number) {
    this.bufferMode = mode;
  }

  setTextStyle(game: Game, style: number) {
    this.textStyle = style;
  }

  setTextColors(
    game: Game,
    windowId: number,
    foreground: number,
    background: number
  ) {
    const newColors = { foreground, background };
    if (newColors.foreground === Color.Current) {
      newColors.foreground = this.colors[windowId].foreground;
    }
    if (newColors.background === Color.Current) {
      newColors.background = this.colors[windowId].background;
    }
    this.colors[windowId] = newColors;
  }

  getSize(): ScreenSize {
    return { cols: 80, rows: 255 /* 255 == infinite height */ };
  }

  quit(): void {
    process.exit(0);
  }
}
