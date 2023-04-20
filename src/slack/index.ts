#!/usr/bin/env node
import bolt from "@slack/bolt";
import * as fs from "fs";

import Game from "../Game.js";
import Log from "../log.js";
import { SnapshotData } from "../types.js";
import BotScreen from "./screen.js";
import BotStorage from "./storage.js";

type SlackMessage = bolt.SlackEventMiddlewareArgs<"message">["message"];

const BOT_NAME = "Ebozz";
const DEBUG_CHANNEL_NAME = "ebozz-debug";

const GAMES: Record<string, { name: string; path: string }> = {
  zork1: {
    name: "Zork I: The Great Underground Empire",
    path: "./gamefiles/zork1-r119-s880429.z3",
  },
  zork2: {
    name: "Zork II: The Wizard of Frobozz",
    path: "./gamefiles/zork2-r63-s860811.z3",
  },
  zork3: {
    name: "Zork III: The Dungeon Master",
    path: "./gamefiles/zork3-r25-s860811.z3",
  },
  hitchhikers: {
    name: "The Hitchhiker's Guide To The Galaxy",
    path: "./gamefiles/hitchhiker-r59-s851108.z3",
  },
  wishbringer: {
    name: "Wishbringer (doesn't work currently)",
    path: "./gamefiles/wishbringer-r69-s850920.z3",
  },
  trinity: {
    name: "Trinity (doesn't work currently)",
    path: "./gamefiles/trinity-r15-s870628.z4",
  },
};

const USAGE = `commands are:
*games*: shows all the games available for play
*play <game id>*: starts a new game in this channel.  if another game is currently active, stops that one
*restart*: restarts the current game
*quit*: stops the current game
*help*: prints this
`;

function saveNotSupported() {
  throw new Error("no save support in slackbot.");
}

function loadNotSupported(): SnapshotData {
  throw new Error("no load support in slackbot.");
}

export class EbozzBot {
  private app: bolt.App;
  private user: any;
  private storage: BotStorage;

  constructor(signingSecret: string, botToken: string, appToken: string) {
    this.app = new bolt.App({
      signingSecret,
      token: botToken,
      appToken,
      socketMode: true,
    });
    this.storage = new BotStorage(`./slackbot-storage/${botToken}`);
  }

  async debugChannel(msg: string) {
    await this.app.client.chat.postMessage({
      channel: DEBUG_CHANNEL_NAME,
      text: `[debug] ${msg}`,
    });
  }

  async postMessageToChannel(channel: string, msg: string) {
    try {
      await this.app.client.chat.postMessage({
        channel,
        text: msg,
      });
    } catch (e) {
      this.debugChannel(`error posting message: ${e.message}`);
    }
  }

  async setTopic(channel: string, topic: string) {
    try {
      await this.app.client.conversations.setTopic({
        channel,
        topic,
      });
    } catch (e) {
      this.debugChannel(`error setting topic: ${e.message}`);
    }
  }

  message = async ({ message, say }) => {
    // console.log("got message", JSON.stringify(message, null, 2));

    if (
      !this.isChatMessage(message) ||
      !this.isChannelConversation(message) ||
      this.isFromMe(message)
    ) {
      return;
    }

    const channelId = message.channel;
    const channelState = this.storage.stateForChannel(channelId);

    if (this.isAtMe(message)) {
      // meta commands:
      //  (list) games
      //  play <gameid>
      //  restart
      //  quit

      const atMe = `<@${this.user.id}>`;
      const command = message.text.slice(atMe.length).trim();

      console.log("command =", command);

      if (command == "games") {
        // console.log(message);
        let response = "Games available:\n";
        for (const id of Object.keys(GAMES).sort()) {
          const g = GAMES[id];
          response += `*${id}*: _${g.name}_\n`;
        }

        say(response);
        return;
      }

      if (command.startsWith("play ")) {
        const gameId = command.slice("play ".length).trim();
        if (!GAMES[gameId]) {
          say(`unknown game ${gameId}`);
          return;
        }

        this.debugChannel(`starting game ${gameId} in channel ${channelId}`);

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
          say("There isn't a game running in this channel.");
          return;
        }

        const { gameId } = channelState;
        this.debugChannel(`restarting game ${gameId} in channel ${channelId}`);

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
          say("There isn't a game running in this channel.");
          return;
        }

        const { gameId } = channelState;

        this.debugChannel(`quitting game ${gameId} in channel ${channelId}`);

        this.storage.gameStoppedInChannel(channelId);
        say(`stopped game ${gameId}.`);
        return;
      }

      if (command === "help") {
        say(USAGE);
        return;
      }

      const response = `unrecognized command ${command}.\n${USAGE}`;
      say(response);
      return;
    }

    if (this.isGameCommand(message)) {
      // console.log(message, current_input_state);
      if (!channelState) {
        say("channel doesn't have an active game.  try 'play <gameid>'.");
        return;
      }

      const { gameId, snapshot, inputState } = channelState;

      this.debugChannel(
        `game command '${this.getGameCommandText(
          message
        )}', game ${gameId} in channel ${channelId}`
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
        say("not ready for input yet");
      }
    }
  };

  async run() {
    const resp = await this.app.client.users.list({});
    this.user = resp.members?.find((u) => u.real_name === BOT_NAME);
    if (!this.user) {
      throw new Error("could not find bot user");
    }

    console.log(`bot user: ${this.user.id}`);

    this.app.message(this.message);

    await this.app.start(process.env.PORT || 3000);
    this.debugChannel("⚡️ Ebozz app is running!");
  }

  isGameCommand(message: SlackMessage) {
    if (
      // these message subtypes don't have text
      message.subtype === "message_deleted" ||
      message.subtype === "message_changed" ||
      message.subtype === "message_replied"
    ) {
      return false;
    }
    return message.text?.[0] === "$";
  }

  getGameCommandText(message: SlackMessage) {
    if (
      // these message subtypes don't have text
      message.subtype === "message_deleted" ||
      message.subtype === "message_changed" ||
      message.subtype === "message_replied"
    ) {
      return "";
    }

    return message.text?.slice(1) || "";
  }

  isChatMessage(message: SlackMessage) {
    if (
      // these message subtypes don't have text
      message.subtype === "message_deleted" ||
      message.subtype === "message_changed" ||
      message.subtype === "message_replied"
    ) {
      return undefined;
    }

    return message.text !== undefined;
  }

  isChannelConversation(message: SlackMessage) {
    return message.channel_type === "channel";
  }

  isAtMe(message: SlackMessage) {
    return !message.subtype && message.text?.startsWith(`<@${this.user.id}>`);
  }

  isFromMe(_message: SlackMessage) {
    return false;
    // return message.bot_id === this.user.profile.bot_id;
  }
}
const bot = new EbozzBot(
  process.env.SLACK_SIGNING_SECRET || "",
  process.env.SLACK_BOT_TOKEN || "",
  process.env.SLACK_APP_TOKEN || ""
);
bot.run();
