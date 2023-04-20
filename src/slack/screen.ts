import Game from "../Game.js";
import Log from "../log.js";
import EbozzBot from "./bot.js";
import { InputState } from "../types.js";
import { Capabilities, ScreenBase, ScreenSize } from "../Screen.js";

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
    console.log(`posting ${this.output_buffer}`);
    this.bot.postMessageToChannel(
      this.channelId,
      this.output_buffer
      // use this to get a code block to see all characters
      // "```\n" + this.output_buffer + "\n```"
    );
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
    // console.log(`printing "${str}"`);
    this.output_buffer += str;
  }

  updateStatusBar(lhs: string, rhs: string): void {
    this.bot.setTopic(this.channelId, `${this.gameId} | ${lhs} | ${rhs}`);
  }

  getSize(): ScreenSize {
    return { cols: 80, rows: 255 /* 255 == infinite height */ };
  }

  getCapabilities(): Capabilities {
    return {
      hasColors: false,
      hasBold: true,
      hasItalic: true,
      hasReverseVideo: false,
      hasFixedPitch: true,
      hasSplitWindow: false,
      // XXX hasDisplayStatusBar should be true, but it causes `Error: illegal
      // opcode: 29` in zork1 when opening the mailbox
      hasDisplayStatusBar: false,
      hasPictures: false,
      hasSound: false,
      hasTimedKeyboardInput: false,
    };
  }
}
