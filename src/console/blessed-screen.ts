import blessed from "blessed";
import Log from "../log.js";
import {
  ScreenBase,
  ScreenSize,
  BufferMode,
  TextStyle,
  Color,
  colorToString,
  Capabilities,
} from "../Screen.js";
import type Game from "../Game.js";
import { InputState } from "../types.js";
import { toI16 } from "../cast16.js";

class Window {
  screen: blessed.Widgets.Screen;
  box: blessed.Widgets.Log;
  bufferMode: BufferMode;
  textStyle: TextStyle;
  foreground: Color;
  background: Color;
  cursorPosRow: number;
  cursorPosCol: number;
  styledBuffer: string;
  textBuffer: string;
  top: number;
  height: number;

  constructor(screen: blessed.Widgets.Screen, top: number, height: number) {
    this.screen = screen;
    this.box = blessed.log({
      parent: this.screen,
      top,
      left: 0,
      width: this.screen.cols,
      height,
      tags: true,
    });
    this.top = top;
    this.height = height;
    this.bufferMode = BufferMode.Buffered;
    this.textStyle = TextStyle.Roman;
    this.foreground = Color.Default;
    this.background = Color.Default;
    this.cursorPosRow = -1;
    this.cursorPosCol = -1;

    // next two used if bufferMode is Buffered
    this.styledBuffer = "";
    this.textBuffer = "";

    this.clear();
  }

  getCapabilities(): Capabilities {
    return {
      hasColors: true,
      hasBold: true,
      hasItalic: false,
      hasReverseVideo: true,
      hasFixedPitch: false,
      hasSplitWindow: true,
      hasDisplayStatusBar: true,
      hasPictures: false,
      hasSound: false,
      hasTimedKeyboardInput: true,
    };
  }

  resize(top: number, height: number) {
    this.box.top = top;
    this.box.height = height;
    this.top = top;
    this.height = height;
  }

  styleText(str: string): string {
    const style = this.textStyle;
    const foreground = this.foreground;
    const background = this.background;

    const fgColor = colorToString(foreground);
    const bgColor = colorToString(background);

    let text = blessed.escape(str);

    if (fgColor !== "") {
      text = `{${fgColor}-fg}${text}{/${fgColor}-fg}`;
    }
    if (bgColor !== "") {
      text = `{${bgColor}-bg}${text}{/${bgColor}-bg}`;
    }

    if (style === TextStyle.Bold) {
      text = `{bold}${text}{/bold}`;
    }
    // not yet - does blessed do italic?
    // if (style === TextStyle.Italic) {
    //   text = `{italic}${text}{/italic}`;
    // }
    if (style === TextStyle.ReverseVideo) {
      text = `{inverse}${text}{/inverse}`;
    }

    return text;
  }

  bufferText(unstyledStr: string) {
    this.styledBuffer += this.styleText(unstyledStr);
    this.textBuffer += unstyledStr;
  }

  flushBuffer() {
    this.box.log(this.styledBuffer);
    this.styledBuffer = "";
    this.textBuffer = "";
  }

  clearBuffer() {
    this.styledBuffer = "";
    this.textBuffer = "";
  }

  clear() {
    this.box.setContent("");
    for (let i = 0; i < this.height; i++) {
      this.box.log("");
    }
    this.clearBuffer();
  }
}

export default class BlessedScreen extends ScreenBase {
  private screen: blessed.Widgets.Screen;
  private windows: Array<Window>;
  private outputWindow: number;
  statusBarVisible: boolean;
  statusBarBox: blessed.Widgets.TextElement;

  constructor(log: Log) {
    super(log, "BlessedScreen");
    this.screen = blessed.screen({
      smartCSR: true,
    });
    this.screen.title = "Ebozz";

    this.windows = [
      // start with window 0 taking up no space
      new Window(this.screen, this.screen.rows, 0),
      // start with window 1 taking up the whole screen
      new Window(this.screen, 0, this.screen.rows),
    ];

    this.screen.key(["C-c"], (_ch, _key) => {
      this.screen.destroy();
      return process.exit(0);
    });

    this.outputWindow = 1;
    this.windows[this.outputWindow].box.focus();

    this.screen.render();
  }

  getInputFromUser(game: Game, input_state: InputState) {
    this.log.debug(`BlessedScreen.getInputFromUser`);

    const outputWindow = this.windows[this.outputWindow];

    // the prompt might be buffered.  display that and .. add a cursor someplace
    outputWindow.flushBuffer();

    const screenLines = outputWindow.box.getScreenLines();
    const text = blessed.textbox({
      parent: this.screen,
      top: outputWindow.top + screenLines.length - 1,
      left: screenLines[screenLines.length - 1].length + 1,
      width: this.screen.cols - screenLines[screenLines.length - 1].length,
      height: 1,
      input: true,
      inputOnFocus: true,
    });
    text.on("submit", () => {
      outputWindow.box.setLine(
        screenLines.length - 1,
        screenLines[screenLines.length - 1] + " " + text.getValue()
      );
      game.continueAfterUserInput(input_state, text.getValue());
      text.destroy();
    });
    text.on("cancel", () => {
      text.focus();
    });
    text.enableKeys();
    text.focus();
    this.screen.render();
  }

  getKeyFromUser(game: Game, input_state: InputState) {
    this.log.debug(`BlessedScreen.getKeyFromUser`);
    this.screen.once("keypress", (_ch, _key) => {
      game.continueAfterKeyPress(input_state, " " /* the key pressed */);
    });
  }

  print(_game: Game, str: string) {
    this.log.debug(`BlessedScreen.print str="${str}"`);

    const outputWindow = this.windows[this.outputWindow];

    if (outputWindow.bufferMode === BufferMode.Buffered) {
      if (str === "\n") {
        outputWindow.flushBuffer();
        return;
      }

      const paragraphs = str.split("\n");
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        if (
          outputWindow.textBuffer.length + paragraph.length <=
          this.screen.cols
        ) {
          // we don't need to wrap this paragraph.  style it and either buffer it (if it's the last paragraph) or output it.
          if (i === paragraphs.length - 1) {
            if (paragraph.length > 0) {
              outputWindow.bufferText(paragraph);
            }
          } else {
            outputWindow.bufferText(paragraph);
            outputWindow.flushBuffer();
          }
        } else {
          // we need to wrap this paragraph
          let text = "";
          let startIdx = 0;

          while (startIdx < paragraph.length) {
            const nextSpace = paragraph.indexOf(
              " ",
              paragraph[startIdx] === " " ? startIdx + 1 : startIdx
            );
            const nextWord =
              nextSpace === -1
                ? paragraph.substring(startIdx)
                : paragraph.substring(startIdx, nextSpace);

            if (
              outputWindow.textBuffer.length + text.length + nextWord.length >
              this.screen.cols
            ) {
              outputWindow.bufferText(text);
              outputWindow.flushBuffer();
              text = nextWord.trimStart();
            } else {
              text += nextWord;
            }

            if (nextSpace === -1) {
              break;
            }
            startIdx = nextSpace;
          }

          if (text.length > 0) {
            outputWindow.bufferText(text);
            if (i !== paragraphs.length - 1) {
              outputWindow.flushBuffer();
            }
          }
        }
      }
      return;
    }

    if (outputWindow.cursorPosRow === -1 && outputWindow.cursorPosCol === -1) {
      outputWindow.box.log(this.styleText(str));
    } else {
      // do we need to fetch the current line and overlay str on top of it before writing it back out? ugh...
      const prefix = " ".repeat(outputWindow.cursorPosCol);
      const suffix = " ".repeat(
        this.screen.cols - outputWindow.cursorPosCol - str.length
      );

      outputWindow.box.setLine(
        outputWindow.cursorPosRow - 1,
        this.styleText(prefix + str + suffix)
      );
    }
    this.screen.render();
  }

  styleText(str: string): string {
    const style = this.windows[this.outputWindow].textStyle;
    const foreground = this.windows[this.outputWindow].foreground;
    const background = this.windows[this.outputWindow].background;

    const fgColor = colorToString(foreground);
    const bgColor = colorToString(background);

    let text = blessed.escape(str);

    if (fgColor !== "") {
      text = `{${fgColor}-fg}${text}{/${fgColor}-fg}`;
    }
    if (bgColor !== "") {
      text = `{${bgColor}-bg}${text}{/${bgColor}-bg}`;
    }

    if (style === TextStyle.Bold) {
      text = `{bold}${text}{/bold}`;
    }
    // not yet - does blessed do italic?
    // if (style === TextStyle.Italic) {
    //   text = `{italic}${text}{/italic}`;
    // }
    if (style === TextStyle.ReverseVideo) {
      text = `{inverse}${text}{/inverse}`;
    }

    return text;
  }

  setOutputWindow(_game: Game, windowId: number) {
    this.log.debug(`BlessedScreen.setOutputWindow windowId=${windowId}`);
    this.outputWindow = windowId;
    this.windows[this.outputWindow].box.focus();
    this.screen.render();
  }

  getOutputWindow(_game: Game) {
    this.log.debug(
      `BlessedScreen.getOutputWindow -> windowId=${this.outputWindow}`
    );
    return this.outputWindow;
  }

  splitWindow(game: Game, lines: number): void {
    if (this.statusBarVisible) {
      throw new Error("cannot split the screen when we have a status bar");
    }

    if (lines === 0) {
      // unsplit the screen so box 1 takes up the full height
      this.unsplitWindow(game);
    } else {
      // split the screen so that box 1 gets the specified number of lines
      this.windows[1].resize(this.screen.rows, lines);
      this.windows[0].resize(lines, this.screen.rows - lines);
    }

    this.screen.render();
  }

  private unsplitWindow(_game: Game): void {
    this.windows[1].resize(0, this.screen.rows);
    this.windows[0].resize(this.screen.rows, 0);
    this.screen.render();
  }

  clearWindow(game: Game, windowId: number): void {
    const id = toI16(windowId);
    this.log.debug(`BlessedScreen.clearWindow windowId=${id}`);
    if (id < 0) {
      this.windows[0].clear();
      this.windows[1].clear();
      if (id === -1) {
        this.unsplitWindow(game);
      }
    } else {
      this.windows[id].clear();
    }
    this.screen.render();
  }

  setCursorPosition(
    _game: Game,
    line: number,
    column: number,
    windowId: number
  ): void {
    this.log.debug(
      `BlessedScreen.setCursorPosition line=${line} column=${column} windowId=${windowId}`
    );
    this.windows[windowId].cursorPosRow = line;
    this.windows[windowId].cursorPosCol = column;
  }

  setTextStyle(_game: Game, style: TextStyle): void {
    this.log.debug(`BlessedScreen.setTextStyle style=${style}`);
    this.windows[this.outputWindow].textStyle = style;
  }

  setTextColors(
    _game: Game,
    windowId: number,
    foreground: Color,
    background: Color
  ) {
    this.log.debug(
      `BlessedScreen.setTextColor windowId=${windowId} foreground=${foreground} background=${background}`
    );
    this.windows[windowId].foreground = foreground;
    this.windows[windowId].background = background;
  }

  setBufferMode(_game: Game, mode: BufferMode): void {
    this.log.debug(`BlessedScreen.setBufferMode mode=${mode}`);
    this.windows[this.outputWindow].bufferMode = mode;
  }

  getSize(): ScreenSize {
    return { rows: this.screen.rows, cols: this.screen.cols };
  }

  updateStatusBar(lhs: string, rhs: string): void {
    // ensure the status bar is visible, and fill it in
    if (!this.statusBarVisible) {
      this.statusBarVisible = true;
      this.statusBarBox = blessed.text({
        parent: this.screen,
        top: 0,
        left: 0,
        width: this.screen.cols,
        height: 1,
        tags: true,
      });

      this.windows[0].resize(
        this.windows[0].top + 1,
        this.windows[0].height - 1
      );
      this.windows[1].resize(
        this.windows[1].top + 1,
        this.windows[1].height - 1
      );
      this.screen.render();
    }
    const contents =
      lhs + " ".repeat(this.screen.cols - lhs.length - rhs.length - 1) + rhs;
    this.statusBarBox.setContent(`{inverse}${contents}{/inverse}`);
  }

  quit(): void {
    process.exit(0);
  }
}
