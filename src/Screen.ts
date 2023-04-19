import type Game from "./Game.js";
import Log from "./log.js";
import type { InputState } from "./types.js";

export enum TextStyle {
  Roman = 0,
  ReverseVideo = 1,
  Bold = 2,
  Italic = 4,
  FixedPitch = 8,
}

export enum Color {
  Current = 0,
  Default = 1,
  Black = 2,
  Red = 3,
  Green = 4,
  Yellow = 5,
  Blue = 6,
  Magenta = 7,
  Cyan = 8,
  White = 9,
  Gray = 10,
}

export function colorToString(c: Color): string {
  switch (c) {
    case Color.Black:
      return "black";
    case Color.Red:
      return "red";
    case Color.Green:
      return "green";
    case Color.Yellow:
      return "yellow";
    case Color.Blue:
      return "blue";
    case Color.Magenta:
      return "magenta";
    case Color.Cyan:
      return "cyan";
    case Color.White:
      return "white";
    case Color.Gray:
      return "gray";
    default:
      return "";
  }
}

export enum BufferMode {
  NotBuffered = 0,
  Buffered = 1,
}

export type ScreenSize = {
  rows: number;
  cols: number;
};

export type Capabilities = {
  hasColors: boolean;
  hasBold: boolean;
  hasItalic: boolean;
  hasReverseVideo: boolean;
  hasFixedPitch: boolean;

  hasSplitWindow: boolean;
  hasDisplayStatusBar: boolean;
  hasPictures: boolean;
  hasSound: boolean;
  hasTimedKeyboardInput: boolean;
};

export interface Screen {
  getCapabilities(): Capabilities;
  getInputFromUser(game: Game, input_state: InputState): void;
  getKeyFromUser(game: Game, input_state: InputState): void;
  print(game: Game, str: string): void;
  splitWindow(game: Game, lines: number): void;
  setOutputWindow(game: Game, windowId: number): void;
  getOutputWindow(game: Game): number;
  clearWindow(game: Game, windowId: number): void;
  clearLine(game: Game, value: number): void;
  setCursorPosition(
    _game: Game,
    _line: number,
    _column: number,
    _windowId: number
  ): void;
  hideCursor(game: Game, windowId: number): void;
  showCursor(game: Game, windowId: number): void;
  setBufferMode(game: Game, mode: BufferMode): void;
  setTextStyle(game: Game, style: TextStyle): void;
  setTextColors(
    game: Game,
    windowId: number,
    foreground: Color,
    background: Color
  ): void;
  enableOutputStream(
    game: Game,
    streamId: number,
    table: number,
    width: number
  ): void;
  disableOutputStream(
    game: Game,
    streamId: number,
    table: number,
    width: number
  ): void;
  selectInputStream(game: Game, streamId: number): void;
  getSize(): ScreenSize;
  updateStatusBar(lhs: string, rhs: string): void;
}

export class ScreenBase implements Screen {
  protected log: Log;
  private id: string;

  constructor(log: Log, id: string) {
    this.log = log;
    this.id = id;
  }

  getInputFromUser(_game: Game, _input_state: InputState) {
    this.log.debug(`not implemented: ${this.id} getInputFromUser`);
  }

  getKeyFromUser(_game: Game, _input_state: InputState) {
    this.log.debug(`not implemented: ${this.id} getInputFromUser`);
  }

  print(_game: Game, _str: string) {
    this.log.debug(`not implemented: ${this.id} print`);
  }

  splitWindow(_game: Game, lines: number) {
    this.log.debug(`not implemented: ${this.id} splitWindow lines=${lines}`);
  }

  setOutputWindow(_game: Game, windowId: number) {
    this.log.debug(
      `not implemented: ${this.id} setOutputWindow windowId=${windowId}`
    );
  }

  getOutputWindow(_game: Game) {
    this.log.debug(`not implemented: ${this.id} getOutputWindow`);
    return 0;
  }

  clearWindow(_game: Game, windowId: number) {
    this.log.debug(
      `not implemented: ${this.id} clearWindow windowId=${windowId}`
    );
  }

  clearLine(_game: Game, value: number) {
    this.log.debug(`not implemented: ${this.id} clearLine value=${value}`);
  }

  setCursorPosition(
    _game: Game,
    line: number,
    column: number,
    windowId: number
  ) {
    this.log.debug(
      `not implemented: ${this.id} setCursorPosition line=${line} column=${column} windowId=${windowId}`
    );
  }

  hideCursor(_game: Game, windowId: number) {
    this.log.debug(
      `not implemented: ${this.id} hideCursor windowId=${windowId}`
    );
  }

  showCursor(_game: Game, windowId: number) {
    this.log.debug(
      `not implemented: ${this.id} showCursor windowId=${windowId}`
    );
  }

  setBufferMode(_game: Game, mode: BufferMode) {
    this.log.debug(`not implemented: ${this.id} setBufferMode mode=${mode}`);
  }

  setTextStyle(_game: Game, style: TextStyle) {
    this.log.debug(`not implemented: ${this.id} setTextStyle style=${style}`);
  }

  setTextColors(
    game: Game,
    windowId: number,
    foreground: Color,
    background: Color
  ) {
    this.log.debug(
      `not implemented: ${this.id} setTextColors windowId=${windowId} foreground=${foreground} background=${background}`
    );
  }

  enableOutputStream(
    _game: Game,
    streamId: number,
    table: number,
    width: number
  ) {
    this.log.error(
      `not implemented: ${this.id} enableOutputStream streamId=${streamId} table=${table} width=${width}`
    );
  }

  disableOutputStream(
    _game: Game,
    streamId: number,
    table: number,
    width: number
  ) {
    this.log.error(
      `not implemented: ${this.id} disableOutputStream streamId=${streamId} table=${table} width=${width}`
    );
  }

  selectInputStream(_game: Game, streamId: number) {
    this.log.error(
      `not implemented: ${this.id} selectInputStream streamId=${streamId}`
    );
  }

  getSize(): ScreenSize {
    this.log.debug(`not implemented: ${this.id} getSize`);
    return { rows: 25, cols: 80 };
  }

  updateStatusBar(lhs: string, rhs: string): void {
    this.log.debug(
      `not implemented: ${this.id} updateStatusBar lhs=${lhs} rhs=${rhs}`
    );
  }

  getCapabilities(): Capabilities {
    this.log.debug(`not implemented: ${this.id} getCapabilities`);
    return {
      hasColors: false,
      hasBold: false,
      hasItalic: false,
      hasReverseVideo: false,
      hasFixedPitch: false,
      hasSplitWindow: false,
      hasDisplayStatusBar: false,
      hasPictures: false,
      hasSound: false,
      hasTimedKeyboardInput: false,
    };
  }
}
