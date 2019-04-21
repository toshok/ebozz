#!/usr/bin/env node
import Bot from "slackbots";
import * as fs from "fs";
import Game from "./ebozz";
import Log from "./log";

const BOT_NAME = "Ebozz";
const CHANNEL_NAME = "test";

const GAMES = {
  zork1: {
    name: "Zork I: The Great Underground Empire",
    path: "./tests/zork1.dat"
  },
  zork2: { name: "Zork II: The Wizard of Frobozz", path: "./tests/zork2.dat" },
  zork3: { name: "Zork III: The Dungeon Master", path: "./tests/zork3.dat" },
  hitchhikers: {
    name: "The Hitchhiker'S Guide To The Galaxy",
    path: "./tests/hitchhikersguide.dat"
  },
  wishbringer: {
    name: "Wishbringer (doesn't work currently)",
    path: "./tests/wishbringer.dat"
  },
  trinity: {
    name: "Trinity (doesn't work currently)",
    path: "./tests/trinity.dat"
  }
};

let channelState = {};

function gameStartedInChannel(channel, gameId, snapshot) {
  channelState[channel] = { gameId, snapshot };
}
function gameWaitingForInput(channel, input_state, snapshot) {
  console.log("snapshot length = ", snapshot.length);
  channelState[channel] = { ...channelState[channel], input_state, snapshot };
}
function gameStoppedInChannel(channel) {
  channelState[channel] = null;
}

class EbozzBot {
  constructor(token) {
    this.bot = new Bot({ name: BOT_NAME, token });
  }

  debugChannel(msg) {
    this.bot.postMessageToChannel(CHANNEL_NAME, `[debug] ${msg}`);
  }

  run() {
    let output_buffer = "";
    let current_input_state;

    this.bot.on("start", () => {
      this.debugChannel("starting up");
      // console.log(this.bot);
      this.user = this.bot.users.filter(user => user.real_name === BOT_NAME)[0];

      this.bot.on("message", message => {
        if (
          !this.isChatMessage(message) ||
          !this.isChannelConversation(message) ||
          this.isFromMe(message)
        ) {
          return;
        }

        let channelName = this.bot.channels.find(c => c.id === message.channel)
          .name;
        if (this.isAtMe(message)) {
          // console.log(message);
          // meta commands:
          //  list games
          //  start <gameid>
          //  restart
          //  quit

          let atMe = `<@${this.user.id}>`;
          let command = message.text.slice(atMe.length).trim();

          if (command == "list games") {
            // console.log(message);
            let response = "Games available:\n";
            for (let id of Object.keys(GAMES).sort()) {
              let g = GAMES[id];
              response += `*${id}*: _${g.name}_\n`;
            }

            this.bot.postMessageToChannel(channelName, response);
            return;
          }

          if (command.startsWith("start ")) {
            let gameId = command.slice("start ".length).trim();
            if (!GAMES[gameId]) {
              this.bot.postMessageToChannel(
                CHANNEL_NAME,
                `unknown game ${gameId}`
              );
              return;
            }

            let game = new Game(
              fs.readFileSync(GAMES[gameId].path),
              new Log(false),
              // game suspended waiting for user input
              input_state => {
                // console.log(`posting ${output_buffer}`);
                this.bot.postMessageToChannel(CHANNEL_NAME, output_buffer);
                output_buffer = "";
                // console.log("setting input_state to", input_state);
                // console.log("and waiting until we get user input");
                gameWaitingForInput(
                  message.channel,
                  input_state,
                  game.snapshotToBuffer()
                );
              },
              // output callback
              str => {
                output_buffer += str;
              },

              // save callback
              () => {
                throw new Error("no save support in slackbot.");
              },
              // restore callback
              () => {
                throw new Error("no save support in slackbot.");
              }
            );

            game.execute();

            return;
          }

          if (command == "restart") {
            return;
          }

          if (command == "quit") {
            if (!channelState[message.channel]) {
              this.bot.postMessage(
                channelName,
                "There isn't a game running in this channel."
              );
              return;
            }
            let { gameId } = channelState[message.channel];
            channelState[message.channel] = undefined;
            this.bot.postMessageToChannel(
              channelName,
              `stopped game ${gameId}.`
            );
            return;
          }

          let response = `unrecognized command. commands are:
          *list games*: shows all the games available for play
          *start <game id>*: starts a new game in this channel.  if another game is currently active, stops that one
          *restart*: restarts the current game
          *quit*: stops the current game
          `;

          this.bot.postMessageToChannel(channelName, response);
          return;
        }

        if (this.isGameCommand(message)) {
          // console.log(message, current_input_state);

          if (!channelState[message.channel]) {
            this.bot.postMessageToChannel(
              CHANNEL_NAME,
              "channel doesn't have an active game.  try 'start <gameid>'."
            );
            return;
          }

          let { snapshot, input_state } = channelState[message.channel];
          if (input_state) {
            // console.log("continuing game");

            let game = Game.fromSnapshot(
              snapshot,
              new Log(false),
              // game suspended waiting for user input
              input_state => {
                // console.log(`posting ${output_buffer}`);
                this.bot.postMessageToChannel(CHANNEL_NAME, output_buffer);
                output_buffer = "";
                // console.log("setting input_state to", input_state);
                // console.log("and waiting until we get user input");
                gameWaitingForInput(
                  message.channel,
                  input_state,
                  game.snapshotToBuffer()
                );
              },
              // output callback
              str => {
                output_buffer += str;
              },

              // save callback
              () => {
                throw new Error("no save support in slackbot.");
              },
              // restore callback
              () => {
                throw new Error("no save support in slackbot.");
              }
            );

            game.continueAfterUserInput(
              input_state,
              this.getGameCommandText(message)
            );
          } else {
            this.bot.postMessageToChannel(
              CHANNEL_NAME,
              "not ready for input yet"
            );
          }
        }
      });
    });
  }

  isGameCommand(message) {
    return message.text[0] === "$";
  }
  getGameCommandText(message) {
    return message.text.slice(1);
  }

  isChatMessage(message) {
    return message.type === "message" && Boolean(message.text);
  }

  isChannelConversation(message) {
    return typeof message.channel === "string" && message.channel[0] === "C";
  }

  isAtMe(message) {
    return message.text.startsWith(`<@${this.user.id}>`);
  }

  isFromMe(message) {
    return message.bot_id === this.user.profile.bot_id;
  }
}

let bot = new EbozzBot(
  fs
    .readFileSync("EBOZZ_SLACK_TOKEN")
    .toString()
    .trim()
);
bot.run();
