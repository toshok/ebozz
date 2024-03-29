import bolt from "@slack/bolt";
import { UsersListResponse } from "@slack/web-api";

import * as fs from "fs";
import * as path from "path";

import { Game, Log, SnapshotData, Games } from "@ebozz/core";
import { ChatBot } from "../types.js";
import BotScreen from "../BotScreen.js";
import BotStorage from "../BotStorage.js";

type SlackMember = NonNullable<UsersListResponse["members"]>[0];
type SlackMessage = bolt.SlackEventMiddlewareArgs<"message">["message"];
type SlackMessageWithText = SlackMessage & { text: string };

const BOT_NAME = "Ebozz";
const DEBUG_CHANNEL_NAME = "ebozz-debug";

const USAGE = `commands are:
*games*: shows all the games available for play
*play <game id>*: starts a new game in this channel.  if another game is currently active, stops that one
*restart*: restarts the current game
*quit*: stops the current game
*help*: prints this
`;

const noSaveLoadSupport = {
  saveSnapshot() {
    throw new Error("no save support in slackbot.");
  },

  loadSnapshot(): SnapshotData {
    throw new Error("no load support in slackbot.");
  },
};

function listAvailableGames() {
  let response = "Games available:\n";
  for (const id of Object.keys(Games).sort()) {
    const g = Games[id];
    response += `*${id}*: _${g.name}_\n`;
  }
  return response;
}

function getPort(): number {
  return process.env.PORT ? parseInt(process.env.PORT) : 3000;
}

export default class Slackbot implements ChatBot {
  private app: bolt.App;
  private receiver: bolt.ExpressReceiver;
  private user: SlackMember | undefined;
  private storage: BotStorage;

  constructor(signingSecret: string, botToken: string, appToken: string) {
    this.receiver = new bolt.ExpressReceiver({ signingSecret });

    this.app = new bolt.App({
      token: botToken,
      appToken,
      // socketMode: true,
      installerOptions: {
        port: getPort(),
      },
      receiver: this.receiver,
    });

    this.storage = new BotStorage(`./bot-storage/slack/${botToken}`);

    this.registerHandlers();
  }

  registerHandlers() {
    this.app.message(this.message);

    this.receiver.router.get("/x/alive", (req, res) => {
      res.writeHead(200);
      res.end(`Things are going just fine at ${req.headers.host}!`);
    });
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
    console.log("got message", JSON.stringify(message, null, 2));

    if (
      !this.isChatMessage(message) ||
      !this.isChannelConversation(message) ||
      this.isThreadMessage(message) ||
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

      const atMe = `<@${this.user?.id}>`;
      const command = message.text.slice(atMe.length).trim();

      console.log("command =", command);

      if (command === "games") {
        // console.log(message);
        say(listAvailableGames());
        return;
      }

      if (command === "play") {
        say(
          "to play a game you must provide the game name as in `play <game name>`"
        );
        say(listAvailableGames());
        return;
      }

      if (command.startsWith("play ")) {
        const gameId = command.slice("play ".length).trim();
        if (!Games[gameId]) {
          say(`unknown game ${gameId}`);
          say(listAvailableGames());
          return;
        }

        this.debugChannel(`starting game ${gameId} in channel ${channelId}`);

        const log = new Log(Boolean(process.env.DEBUG));
        const game = new Game(
          fs.readFileSync(path.join("../../gamefiles", Games[gameId].filename)),
          log,
          new BotScreen(log, this, this.storage, channelId, gameId),
          noSaveLoadSupport
        );

        game.execute();

        return;
      }
      if (command === "restart") {
        if (!channelState) {
          say("There isn't a game running in this channel.");
          return;
        }

        const { gameId } = channelState;
        this.debugChannel(`restarting game ${gameId} in channel ${channelId}`);

        const log = new Log(Boolean(process.env.DEBUG));
        const game = new Game(
          fs.readFileSync(path.join("../../gamefiles", Games[gameId].filename)),
          log,
          new BotScreen(log, this, this.storage, channelId, gameId),
          noSaveLoadSupport
        );

        game.execute();

        return;
      }

      if (command === "quit") {
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
      if (!channelState) {
        say(
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

    await this.app.start(getPort());

    this.debugChannel("⚡️ Ebozz app is running!");
  }

  messageHasText(message: SlackMessage): message is SlackMessageWithText {
    return !(
      // these message subtypes don't have text
      (
        message.subtype === "message_deleted" ||
        message.subtype === "message_changed" ||
        message.subtype === "message_replied"
      )
    );
  }

  isGameCommand(message: SlackMessage) {
    if (!this.messageHasText(message)) {
      return false;
    }
    return message.text?.[0] !== "$";
  }

  getGameCommandText(message: SlackMessage) {
    if (!this.messageHasText(message)) {
      return "";
    }

    return message.text || "";
  }

  isThreadMessage(message: SlackMessage) {
    if (
      !(
        message.subtype === undefined ||
        message.subtype === "bot_message" ||
        message.subtype === "file_share" ||
        message.subtype === "thread_broadcast"
      )
    ) {
      return false;
    }
    return message.thread_ts !== undefined;
  }

  isChatMessage(message: SlackMessage) {
    // this should be a better check - like the actual message type/subtypes.
    if (!this.messageHasText(message)) {
      return undefined;
    }

    return message.text !== undefined;
  }

  isChannelConversation(message: SlackMessage) {
    return message.channel_type === "channel";
  }

  isAtMe(message: SlackMessage) {
    if (!this.messageHasText(message)) {
      return false;
    }
    return !message.subtype && message.text?.startsWith(`<@${this.user?.id}>`);
  }

  isFromMe(_message: SlackMessage) {
    return false;
    // return message.bot_id === this.user.profile.bot_id;
  }
}
