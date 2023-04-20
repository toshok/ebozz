import Game from "../Game.js";
import Log from "../log.js";
import { EbozzBot } from "./index.js";
import { InputState } from "../types.js";
import { ScreenBase } from "../Screen.js";

import BotStorage from "./storage.js";

export default class BotScreen extends ScreenBase {
  private bot: EbozzBot;
  private storage: BotStorage;
  private output_buffer: string;
  private channelId: string;
  private gameId: string;

  constructor(
    log: Log,
    bot: EbozzBot,
    storage: BotStorage,
    channelId: string,
    gameId: string
  ) {
    super(log, "BotScreen");
    this.bot = bot;
    this.storage = storage;
    this.channelId = channelId;
    this.gameId = gameId;
    this.output_buffer = "";
  }

  // game suspended waiting for user input
  getInputFromUser(game: Game, input_state: InputState) {
    // console.log(`posting ${output_buffer}`);
    this.bot.postMessageToChannel(this.channelId, this.output_buffer);
    this.output_buffer = "";
    // console.log("setting input_state to", input_state);
    // console.log("and waiting until we get user input");
    this.storage.gameWaitingForInput(
      this.channelId,
      this.gameId,
      input_state,
      game.snapshotToBuffer()
    );
  }

  // output callback
  print(game: Game, str: string) {
    this.output_buffer += str;
  }
}
