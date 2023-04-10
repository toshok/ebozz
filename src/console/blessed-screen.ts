import * as blessed from "blessed";
import Log from "../log.js";
import { ScreenBase } from "../Screen.js";
import type Game from "../ebozz.js";
import { InputState } from "../types.js";

export default class BlessedScreen extends ScreenBase {
  private screen: blessed.Widgets.Screen;
  private gameLog: any;

  constructor(log: Log) {
    super(log, "BlessedScreen")
    this.screen = blessed.screen({
      smartCSR: true,
    });
    this.screen.title = "Ebozz";

    this.gameLog = blessed.log({
      parent: this.screen,
      border: "line",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    });

    this.gameLog.focus();

    this.screen.key(["C-c"], (_ch, _key) => {
      this.screen.destroy();
      return process.exit(0);
    });

    this.screen.render();
  }

  getInputFromUser(_game: Game, _input_state: InputState) {
    /*
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
    */
  }

  print(game: Game, str: string) {
    this.gameLog.log(str);
    this.screen.render();
    //    process.stdout.write(str);
  }
}
