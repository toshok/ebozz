#!/usr/bin/env node
import Bot from "slackbots";
import * as fs from "fs";
import Game from "./ebozz";
import Log from "./log";

const CHANNEL_NAME = "test";

class EbozzBot {
  constructor(token) {
    this.bot = new Bot({ name: "Ebozz", token });
  }

  run() {
    let output_buffer = "";
    let current_input_state;

    this.bot.on("start", () => {
      this.bot.postMessageToChannel(CHANNEL_NAME, "starting up");
      this.user = this.bot.users.filter(user => user.name === this.name)[0];

      let game = new Game(
        fs.readFileSync("tests/zork1.dat"),
        new Log(false),
        // game suspended waiting for user input
        input_state => {
          console.log(`posting ${output_buffer}`);
          this.bot.postMessageToChannel(CHANNEL_NAME, output_buffer);
          output_buffer = "";
          console.log("setting input_state to", input_state);
          console.log("and waiting until we get user input");
          current_input_state = input_state;
        },
        // output callback
        str => {
          output_buffer += str;
        }
      );

      this.bot.on("message", message => {
        if (
          this.isChatMessage(message) &&
          this.isChannelConversation(message) &&
          !this.isFromMe(message) &&
          this.isGameCommand(message)
        ) {
          console.log(message, current_input_state);
          if (current_input_state) {
            console.log("continuing game");
            game.continueAfterUserInput(
              current_input_state,
              this.getGameCommandText(message)
            );
            current_input_state = null;
          } else {
            this.bot.postMessageToChannel(
              CHANNEL_NAME,
              "not ready for input yet"
            );
          }
        }
      });
      game.execute();
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

  isFromMe(message) {
    console.log(this.user);
    return false;
    // return message.bot_id === this.user.profile.bot_id;
  }
}

let bot = new EbozzBot(
  fs
    .readFileSync("EBOZZ_SLACK_TOKEN")
    .toString()
    .trim()
);
bot.run();
