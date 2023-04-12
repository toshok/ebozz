#!/usr/bin/env node
import Bot from "slackbots";
import * as fs from "fs";
import * as path from "path";

import Game from "../ebozz.js";
import Log from "../log.js";
import { InputState, SnapshotData } from "../types.js";
import { ScreenBase } from "../Screen.js";

type SlackUser = {
  id: string;
  real_name: string;
  profile: {
    bot_id: string;
  };
};

type SlackChannel = {
  id: string;
  name: string;
};

type SlackMessage = {
  type: string;
  subtype: string;
  bot_id: string;
  channel: string;
  text: string;
};

const BOT_NAME = "Ebozz";
const CHANNEL_NAME = "ebozz-debug";

const GAMES: Record<string, { name: string; path: string }> = {
  zork1: {
    name: "Zork I: The Great Underground Empire",
    path: "./tests/zork1.dat",
  },
  zork2: { name: "Zork II: The Wizard of Frobozz", path: "./tests/zork2.dat" },
  zork3: { name: "Zork III: The Dungeon Master", path: "./tests/zork3.dat" },
  hitchhikers: {
    name: "The Hitchhiker's Guide To The Galaxy",
    path: "./tests/hitchhikersguide.dat",
  },
  wishbringer: {
    name: "Wishbringer (doesn't work currently)",
    path: "./tests/wishbringer.dat",
  },
  trinity: {
    name: "Trinity (doesn't work currently)",
    path: "./tests/trinity.dat",
  },
};

const USAGE = `commands are:
*games*: shows all the games available for play
*play <game id>*: starts a new game in this channel.  if another game is currently active, stops that one
*restart*: restarts the current game
*quit*: stops the current game
*help*: prints this
`;

class BotStorage {
  private rootDir: string;
  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  directoryForChannel(channelId: string) {
    return path.join(this.rootDir, channelId);
  }

  ensureDirectoryForChannel(channelId: string) {
    const targetDir = this.directoryForChannel(channelId);
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      return targetDir;
    } catch (e) {
      if (e.code === "EEXIST") {
        return targetDir;
      }
      throw e;
    }
  }

  gameWaitingForInput(
    channelId: string,
    gameId: string,
    inputState: InputState,
    snapshot: Buffer
  ) {
    const targetDir = this.ensureDirectoryForChannel(channelId);
    const gameIdPath = path.join(targetDir, "gameId");
    const inputStatePath = path.join(targetDir, "inputState");
    const snapshotPath = path.join(targetDir, "snapshot.dat");

    fs.writeFileSync(gameIdPath, gameId, { encoding: "utf8" });
    fs.writeFileSync(inputStatePath, JSON.stringify(inputState), {
      encoding: "utf8",
    });
    fs.writeFileSync(snapshotPath, snapshot, { encoding: "binary" });
  }

  gameStoppedInChannel(channelId: string) {
    // this should rimraf the directory
    const targetDir = this.directoryForChannel(channelId);
    const gameIdPath = path.join(targetDir, "gameId");
    const inputStatePath = path.join(targetDir, "inputState");
    const snapshotPath = path.join(targetDir, "snapshot.dat");

    try {
      fs.unlinkSync(gameIdPath);
    } catch (e) {}

    try {
      fs.unlinkSync(inputStatePath);
    } catch (e) {}

    try {
      fs.unlinkSync(snapshotPath);
    } catch (e) {}
  }

  stateForChannel(channelId: string) {
    const targetDir = this.directoryForChannel(channelId);
    const gameIdPath = path.join(targetDir, "gameId");
    const inputStatePath = path.join(targetDir, "inputState");
    const snapshotPath = path.join(targetDir, "snapshot.dat");

    try {
      const gameId = fs.readFileSync(gameIdPath, "utf8").toString();
      const inputState = JSON.parse(
        fs.readFileSync(inputStatePath, "utf8").toString()
      );
      const snapshot = fs.readFileSync(snapshotPath);
      return { gameId, inputState, snapshot };
    } catch (e) {
      return null;
    }
  }
}

class BotScreen extends ScreenBase {
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
    super(log, "EbozzBotScreen");
    this.bot = bot;
    this.storage = storage;
    this.channelId = channelId;
    this.gameId = gameId;
    this.output_buffer = "";
  }

  // game suspended waiting for user input
  getInputFromUser(game: Game, input_state: InputState) {
    // console.log(`posting ${output_buffer}`);
    this.bot.postMessageToChannel(this.output_buffer);
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

function saveNotSupported() {
  throw new Error("no save support in slackbot.");
}

function loadNotSupported(): SnapshotData {
  throw new Error("no load support in slackbot.");
}

class EbozzBot {
  private bot: Bot;
  private user: SlackUser; // XXX
  private storage: BotStorage;

  constructor(token: string) {
    this.bot = new Bot({ name: BOT_NAME, token });
    this.storage = new BotStorage(`./slackbot-storage/${token}`);
  }

  debugChannel(msg: string) {
    this.bot.postMessageToChannel(CHANNEL_NAME, `[debug] ${msg}`);
  }

  postMessageToChannel(msg: string) {
    this.bot.postMessageToChannel(CHANNEL_NAME, msg);
  }

  run() {
    this.bot.on("start", () => {
      this.debugChannel("starting up");
      this.user = this.bot.users.filter(
        (user: SlackUser) => user.real_name === BOT_NAME
      )[0];

      this.bot.on("message", (message: SlackMessage) => {
        if (
          !this.isChatMessage(message) ||
          !this.isChannelConversation(message) ||
          this.isFromMe(message)
        ) {
          return;
        }

        const channelId = message.channel;
        this.bot.channels = undefined; // XXX ugh?
        this.bot
          .getChannels()
          .then(({ channels }: { channels: Array<SlackChannel> }) => {
            try {
              const channel = channels.find((c) => c.id === channelId);
              if (!channel) {
                throw new Error(`channel ${channelId} not found`);
              }
              const channelName = channel.name;
              const channelState = this.storage.stateForChannel(channelId);

              if (this.isAtMe(message)) {
                // meta commands:
                //  (list) games
                //  play <gameid>
                //  restart
                //  quit

                const atMe = `<@${this.user.id}>`;
                const command = message.text.slice(atMe.length).trim();

                if (command == "games") {
                  // console.log(message);
                  let response = "Games available:\n";
                  for (const id of Object.keys(GAMES).sort()) {
                    const g = GAMES[id];
                    response += `*${id}*: _${g.name}_\n`;
                  }

                  this.bot.postMessageToChannel(channelName, response);
                  return;
                }

                if (command.startsWith("play ")) {
                  const gameId = command.slice("play ".length).trim();
                  if (!GAMES[gameId]) {
                    this.bot.postMessageToChannel(
                      channelName,
                      `unknown game ${gameId}`
                    );
                    return;
                  }

                  this.debugChannel(
                    `starting game ${gameId} in channel ${channelName}`
                  );

                  const log = new Log(false);
                  const game = new Game(
                    fs.readFileSync(GAMES[gameId].path),
                    log,
                    new BotScreen(log, this, this.storage, channelId, gameId),
                    {
                      saveSnapshot: saveNotSupported,
                      loadSnapshot: loadNotSupported,
                    }
                  );

                  game.execute();

                  return;
                }

                if (command == "restart") {
                  if (!channelState) {
                    this.bot.postMessage(
                      channelName,
                      "There isn't a game running in this channel."
                    );
                    return;
                  }

                  const { gameId } = channelState;
                  this.debugChannel(
                    `restarting game ${gameId} in channel ${channelName}`
                  );

                  const log = new Log(false);
                  const game = new Game(
                    fs.readFileSync(GAMES[gameId].path),
                    log,
                    new BotScreen(log, this, this.storage, channelId, gameId),
                    {
                      saveSnapshot: saveNotSupported,
                      loadSnapshot: loadNotSupported,
                    }
                  );

                  game.execute();

                  return;
                }

                if (command == "quit") {
                  if (!channelState) {
                    this.bot.postMessage(
                      channelName,
                      "There isn't a game running in this channel."
                    );
                    return;
                  }

                  const { gameId } = channelState;

                  this.debugChannel(
                    `quitting game ${gameId} in channel ${channelName}`
                  );

                  this.storage.gameStoppedInChannel(channelId);
                  this.bot.postMessageToChannel(
                    channelName,
                    `stopped game ${gameId}.`
                  );
                  return;
                }

                if (command === "help") {
                  this.bot.postMessageToChannel(channelName, USAGE);
                  return;
                }

                const response = `unrecognized command ${command}.\n${USAGE}`;
                this.bot.postMessageToChannel(channelName, response);
                return;
              }

              if (this.isGameCommand(message)) {
                // console.log(message, current_input_state);
                if (!channelState) {
                  this.bot.postMessageToChannel(
                    channelName,
                    "channel doesn't have an active game.  try 'play <gameid>'."
                  );
                  return;
                }

                const { gameId, snapshot, inputState } = channelState;

                this.debugChannel(
                  `game command '${this.getGameCommandText(
                    message
                  )}', game ${gameId} in channel ${channelName}`
                );

                if (inputState) {
                  const log = new Log(false);
                  const game = Game.fromSnapshot(
                    snapshot,
                    log,
                    new BotScreen(log, this, this.storage, channelId, gameId),
                    {
                      saveSnapshot: saveNotSupported,
                      loadSnapshot: loadNotSupported,
                    }
                  );

                  game.continueAfterUserInput(
                    inputState,
                    this.getGameCommandText(message)
                  );
                } else {
                  this.bot.postMessageToChannel(
                    channelName,
                    "not ready for input yet"
                  );
                }
              }
            } catch (e) {
              console.error(e);
            }
          });
      });
    });
  }

  isGameCommand(message: SlackMessage) {
    return message.text[0] === "$";
  }
  getGameCommandText(message: SlackMessage) {
    return message.text.slice(1);
  }

  isChatMessage(message: SlackMessage) {
    return message.type === "message" && Boolean(message.text);
  }

  isChannelConversation(message: SlackMessage) {
    return typeof message.channel === "string" && message.channel[0] === "C";
  }

  isAtMe(message: SlackMessage) {
    return !message.subtype && message.text.startsWith(`<@${this.user.id}>`);
  }

  isFromMe(message: SlackMessage) {
    return message.bot_id === this.user.profile.bot_id;
  }
}

const bot = new EbozzBot(process.env.EBOZZ_SLACK_TOKEN || "");
bot.run();
