import type Game from "./ebozz.js";
import Log from "./log.js";
import type { InputState } from "./types.js";

export interface Screen {
    getInputFromUser(game: Game, input_state: InputState): void
    print(game: Game, str: string): void
    splitWindow(game: Game, lines: number): void
    setOutputWindow(game: Game, windowId: number): void
    getOutputWindow(game: Game): number
    clearWindow(game: Game, windowId: number): void
    clearLine(game: Game, value: number): void
    setCursorPosition(_game: Game, _line: number, _column: number, _windowId: number): void
    hideCursor(game: Game, windowId: number): void
    showCursor(game: Game, windowId: number): void
    setBufferMode(game: Game, style: number): void
    setTextStyle(game: Game, style: number): void
    setTextColors(game: Game, windowId: number, foreground: number, background: number): void
    enableOutputStream(game: Game, streamId: number, table: number, width: number): void
    disableOutputStream(game: Game, streamId: number, table: number, width: number): void
    selectInputStream(game: Game, streamId: number): void
}

export class ScreenBase implements Screen {
    protected log: Log;
    private id: string;

    constructor(log: Log, id: string) {
        this.log = log;
        this.id = id;
    }

    getInputFromUser(_game: Game, _input_state: InputState) {
        this.log.error(`not implemented: ${this.id} getInputFromUser`);
    }

      print(game: Game, str: string) {
        this.log.error(`not implemented: ${this.id} print`);
      }
    
      splitWindow(game: Game, lines: number) {
        this.log.error(`not implemented: ${this.id} splitWindow`);
      }
    
      setOutputWindow(game: Game, windowId: number) {
        this.log.error(`not implemented: ${this.id} setOutputWindow`);
      }
    
      getOutputWindow(game: Game) {
        this.log.error(`not implemented: ${this.id} getOutputWindow`);
        return 0;
      }
    
      clearWindow(game: Game, windowId: number) {
        this.log.error(`not implemented: ${this.id} clearWindow`);
      }
    
      clearLine(_game: Game, _value: number) {
        this.log.error(`not implemented: ${this.id} clearLine`);
      }
    
      setCursorPosition(_game: Game, _line: number, _column: number, _windowId: number) {
        this.log.error(`not implemented: ${this.id} setCursorPosition`);
      }
    
      hideCursor(_game: Game, _windowId: number) {
        this.log.error(`not implemented: ${this.id} hideCursor`);
      }
    
      showCursor(_game: Game, _windowId: number) {
        this.log.error(`not implemented: ${this.id} showCursor`);
            }
    
      setBufferMode(_game: Game, _style: number) {
        this.log.error(`not implemented: ${this.id} showBufferMode`);
      }
    
      setTextStyle(_game: Game, _style: number) {
        this.log.error(`not implemented: ${this.id} showTextStyle`);
      }
    
      setTextColors(game: Game, windowId: number, foreground: number, background: number) {
        this.log.error(`not implemented: ${this.id} showTextStyle`);
      }
    
      enableOutputStream(_game: Game, _streamId: number, _table: number, _width: number) {
        this.log.error(`not implemented: ${this.id} enableOutputStream`);
      }
    
      disableOutputStream(_game: Game, _streamId: number, _table: number, _width: number) {
        this.log.error(`not implemented: ${this.id} disableOutputStream`);
      }
    
      selectInputStream(_game: Game, _streamId: number) {
        this.log.error(`not implemented: ${this.id} selectInputStream`);
      }
}