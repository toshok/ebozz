import * as readline from "readline-sync";
import chalk from "chalk";
import Log from "../log.js";
import type { InputState } from "../types.js";
import { ScreenBase } from "../Screen.js"
import type Game from "../ebozz.js";

const TextStyles = {
  Roman: 0,
  ReverseVideo: 1,
  Bold: 2,
  Italic: 4,
  FixedPitch: 8,
} as const;

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
  Gray: 10,
} as const;

const BufferModes = {
  NotBuffered: 0,
  Buffered: 1,
} as const;

export default class StdioScreen extends ScreenBase {
  private textStyle: number;
  private outputWindowId: number;
  private bufferMode: number;
  private colors: Record<number, { foreground: number; background: number }>;

  constructor(log: Log) {
    super(log, "StdioScreen")
    this.textStyle = TextStyles.Roman;
    this.outputWindowId = 0;
    this.bufferMode = BufferModes.Buffered;

    this.colors = {
      0: {
        foreground: Colors.Default,
        background: Colors.Default,
      },
    };
  }

  getInputFromUser(game: Game, input_state: InputState) {
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
  }

  applyStyles(str: string) {
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

  applyColors(str: string) {
    const chalkedString = (str: string, color: number, bg: boolean) => {
      switch (color) {
        case Colors.Black:
          return bg ? chalk.bgBlack(str) : chalk.black(str)
        case Colors.Red:
          return bg ? chalk.bgRed(str) : chalk.red(str);
        case Colors.Green:
          return bg ? chalk.bgGreen(str) : chalk.green(str);
        case Colors.Yellow:
          return bg ? chalk.bgYellow(str) : chalk.yellow(str);// bgOrNot("Yellow", bg);
        case Colors.Blue:
          return bg ? chalk.bgBlue(str) : chalk.blue(str);
        case Colors.Magenta:
          return bg ? chalk.bgMagenta(str) : chalk.magenta(str);
        case Colors.Cyan:
          return bg ? chalk.bgCyan(str) : chalk.cyan(str);
        case Colors.White:
          return bg ? chalk.bgWhite(str) : chalk.white(str);
        case Colors.Gray:
          // because why be consistent?  ugh, chalk.
          return bg ? chalk.bgBlackBright(str) : chalk.gray(str);
        default:
          throw new Error("unrecognized color");
      }
    };

    if (this.colors[this.outputWindowId].background !== Colors.Default) {
      str = chalkedString(str, this.colors[this.outputWindowId].background, true)
    }
    if (this.colors[this.outputWindowId].foreground !== Colors.Default) {
      str = chalkedString(str, this.colors[this.outputWindowId].foreground, false)
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

  setTextColors(game: Game, windowId: number, foreground: number, background: number) {
    let newColors = { foreground, background };
    if (newColors.foreground === Colors.Current) {
      newColors.foreground = this.colors[windowId].foreground;
    }
    if (newColors.background === Colors.Current) {
      newColors.background = this.colors[windowId].background;
    }
    this.colors[windowId] = newColors;
  }
}
