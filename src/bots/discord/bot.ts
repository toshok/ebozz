import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import * as fs from "fs";

import Game from "../../Game.js";
import Log from "../../log.js";
import { SnapshotData } from "../../types.js";
import GAMES from "../../games.js";

import BotScreen from "../BotScreen.js";
import BotStorage from "../BotStorage.js";
import { ChatBot } from "../types.js";

const BOT_NAME = "Ebozz";
const USAGE = `commands are:
*games*: shows all the games available for play
*play <game id>*: starts a new game in this channel.  if another game is currently active, stops that one
*restart*: restarts the current game
*quit*: stops the current game
*help*: prints this
`;

const noSaveLoadSupport = {
  saveSnapshot() {
    throw new Error("no save support in discordbot.");
  },

  loadSnapshot(): SnapshotData {
    throw new Error("no load support in discordbot.");
  },
};

function listAvailableGames() {
  let response = "Games available:\n";
  for (const id of Object.keys(GAMES).sort()) {
    const g = GAMES[id];
    response += `**${id}**: _${g.name}_\n`;
  }
  return response;
}

export default class DiscordBot implements ChatBot {
  private token: string;
  private client: Client;
  private storage: BotStorage;

  constructor(token: string) {
    this.token = token;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  async debugChannel(msg: string) {
    console.log(`[debug] ${msg}`);
  }

  async postMessageToChannel(channelId: string, msg: string) {
    const channel = this.client.channels.cache.get(channelId);
    if (channel === undefined) {
      console.warn("channel undefined", channelId);
      return;
    }
    if (!channel.isTextBased()) {
      console.warn("channel is not text based", channelId);
      return;
    }
    channel.send(msg);
  }

  async setTopic(channelId: string, topic: string) {
    const channel = this.client.channels.cache.get(channelId);
    if (channel === undefined) {
      console.warn("channel undefined", channelId);
      return;
    }
    channel.setTopic(topic);
  }

  message = async (message: Message) => {
    if (this.isFromMe(message)) {
      return;
    }

    const channelId = message.channel.id;
    const channelState = this.storage.stateForChannel(channelId);

    if (this.isAtMe(message)) {
      // meta commands:
      //  (list) games
      //  play <gameid>
      //  restart
      //  quit

      if (this.client.user === null) {
        throw new Error("client.user is null");
      }
      const atMe = `<@&1099753789185085473>`;
      const command = message.content.slice(atMe.length).trim();

      console.log("command =", command);

      if (command === "games") {
        // console.log(message);
        message.channel.send(listAvailableGames());
        return;
      }

      if (command === "play") {
        message.channel.send(
          "to play a game you must provide the game name as in `play <game name>`"
        );
        message.channel.send(listAvailableGames());
        return;
      }

      if (command.startsWith("play ")) {
        const gameId = command.slice("play ".length).trim();
        if (!GAMES[gameId]) {
          message.channel.send(`unknown game ${gameId}`);
          message.channel.send(listAvailableGames());
          return;
        }

        this.debugChannel(`starting game ${gameId} in channel ${channelId}`);

        const log = new Log(Boolean(process.env.DEBUG));
        const game = new Game(
          fs.readFileSync(GAMES[gameId].path),
          log,
          new BotScreen(log, this, this.storage, channelId, gameId),
          noSaveLoadSupport
        );

        game.execute();

        return;
      }
      if (command === "restart") {
        if (!channelState) {
          message.channel.send("There isn't a game running in this channel.");
          return;
        }

        const { gameId } = channelState;
        this.debugChannel(`restarting game ${gameId} in channel ${channelId}`);

        const log = new Log(Boolean(process.env.DEBUG));
        const game = new Game(
          fs.readFileSync(GAMES[gameId].path),
          log,
          new BotScreen(log, this, this.storage, channelId, gameId),
          noSaveLoadSupport
        );

        game.execute();

        return;
      }

      if (command === "quit") {
        if (!channelState) {
          message.channel.send("There isn't a game running in this channel.");
          return;
        }

        const { gameId } = channelState;

        this.debugChannel(`quitting game ${gameId} in channel ${channelId}`);

        this.storage.gameStoppedInChannel(channelId);
        message.channel.send(`stopped game ${gameId}.`);
        return;
      }

      if (command === "help") {
        message.channel.send(USAGE);
        return;
      }

      const response = `unrecognized command ${command}.\n${USAGE}`;
      message.channel.send(response);
      return;
    }

    if (this.isGameCommand(message)) {
      if (!channelState) {
        message.channel.send(
          `channel doesn't have an active game.  try \`@${BOT_NAME} play <gameid>\`.`
        );
        return;
      }

      const { gameId, snapshot, inputState } = channelState;

      this.debugChannel(
        `game command '${this.getGameCommandText(
          message
        )}', game ${gameId} in channel ${channelId}`
      );

      if (inputState) {
        const log = new Log(Boolean(process.env.DEBUG));
        const game = Game.fromSnapshot(
          snapshot,
          log,
          new BotScreen(log, this, this.storage, channelId, gameId),
          noSaveLoadSupport
        );

        game.continueAfterUserInput(
          inputState,
          this.getGameCommandText(message)
        );
      } else {
        message.channel.send("not ready for input yet");
      }
    }
  };

  async run() {
    this.client.once(Events.ClientReady, (c) => {
      console.log(`Ready! Logged in as ${c.user.id} / ${this.client.user?.id}`);
      this.storage = new BotStorage(`./bot-storage/discord/${c.user.id}`);
    });

    this.client.on(Events.MessageCreate, this.message);
    this.client.login(this.token);
  }

  isGameCommand(message: Message) {
    return message.content[0] !== "$";
  }

  getGameCommandText(message: Message) {
    return message.content;
  }

  isAtMe(message: Message) {
    if (this.client.user === null) {
      throw new Error("client.user is null");
    }
    // weird.  the mention is to the bot's role, not the bot's user id.
    return message.content?.startsWith(`<@&1099753789185085473>`);
  }

  isFromMe(message: Message) {
    return message.author.id === this.client.user?.id;
  }
}
