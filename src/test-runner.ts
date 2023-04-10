#!/usr/bin/env node
import * as fs from "fs";

import Log from "./log.js";
import Game from "./ebozz.js";
import { ScreenBase } from "./Screen.js";
import { InputState, Storage } from "./types.js";

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

class TestRunnerScreen extends ScreenBase {
  constructor(log: Log) {
    super(log, "TestRunnerScreen");
  }

  getInputFromUser(game: Game, input_state: InputState) {
    let input = getNextLine();
    if (!input) {
      process.exit(0);
    }
    process.stdout.write(input + "\n");
    game.continueAfterUserInput(input_state, input);
  }

  print(game: Game, str: string) {
    process.stdout.write(str);
  }
}

class TestRunnerStorage implements Storage {
  saveSnapshot(game: Game) {
    fs.writeFileSync("snapshot.dat", game.snapshotToBuffer(), {
      encoding: "binary",
    });
  }

  loadSnapshot(game: Game) {
    let f = fs.readFileSync("snapshot.dat");
    let b = Buffer.from(f.buffer);
    return Game.readSnapshotFromBuffer(Buffer.from(f.buffer));
  }
}

let log = new Log(false);
let game = new Game(
  fs.readFileSync(gameFile),
  log,
  new TestRunnerScreen(log),
  new TestRunnerStorage()
);

game.execute();
