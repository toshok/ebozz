import type Game from "./ebozz";
import Log from "./log";
import type { InputState } from "./types";

export interface Screen {
    getInputFromUser(_game: Game, _input_state)
    print(game: Game, str: string)
    splitWindow(game: Game, lines: number)
    setOutputWindow(game: Game, windowId: number)
    getOutputWindow(game: Game)
    clearWindow(game: Game, windowId: number)
    clearLine(_game: Game, _value: number)
    setCursorPosition(_game: Game, _line: number, _column: number, _windowId: number)
    hideCursor(_game: Game, _windowId: number)
    showCursor(_game: Game, _windowId: number)
    setBufferMode(_game: Game, _style: number)
    setTextStyle(_game: Game, _style: number)
    setTextColors(game: Game, windowId: number, foreground: number, background: number)
    enableOutputStream(_game: Game, _streamId: number, _table: number, _width: number)
    disableOutputStream(_game: Game, _streamId: number, _table: number, _width: number)
}

export class ScreenBase implements Screen {
    protected log: Log;
    private id: string;

    constructor(log: Log, id: string) {
        this.log = log;
        this.id = id;
    }

    getInputFromUser(_game: Game, _input_state) {
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