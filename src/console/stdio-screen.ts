import readline from "readline-sync";
import chalk from "chalk";
import Log from "../log";
import type { InputState } from "../types";
import { ScreenBase } from "../Screen"
import type Game from "../ebozz";

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

  applyColors(str: string) {
    // background first
    const getChalkAccessor = (color: number, bg: boolean) => {
      const bgOrNot = (name: string, bg: boolean) => (bg ? `bg${name}` : name.toLowerCase());
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
