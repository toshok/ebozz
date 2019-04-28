#!/usr/bin/env node
import Log from "./log";
import Game from "./ebozz";

import * as fs from "fs";

let gameName = process.argv[2];

let gameFile = `tests/${gameName}.dat`;
let walkthroughFile = `tests/${gameName}.walkthrough`;

let walkthrough = fs.readFileSync(walkthroughFile, "utf8").split("\n");
let command = 0;

function getNextLine() {
  let line;
  do {
    if (command === walkthrough.length) {
      return;
    }
    line = walkthrough[command++].trim();
  } while (line === "" || line[0] === "#");
  return line;
}

let log = new Log(false);
let game = new Game(
  fs.readFileSync(gameFile),
  log,
  input_state => {
    let input = getNextLine();
    if (!input) {
      process.exit(0);
    }
    process.stdout.write(input + "\n");
    game.continueAfterUserInput(input_state, input);
  },
  str => {
    process.stdout.write(str);
  }
  /*
  () => {
    fs.writeFileSync("snapshot.dat", game.snapshotToBuffer(), {
      encoding: "binary"
    });
  },
  () => {
    let f = fs.readFileSync("snapshot.dat");
    let b = Buffer.from(f.buffer);
    return Game.readSnapshotFromBuffer(Buffer.from(f.buffer));
  }
  */
);

game.execute();
