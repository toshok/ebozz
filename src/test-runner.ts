#!/usr/bin/env node
import * as fs from "fs";

import Log from "./log.js";
import Game from "./Game.js";
import { ScreenBase } from "./Screen.js";
import { InputState, Storage } from "./types.js";

const gameFile = process.argv[2];
const walkthroughFile = process.argv[3];

const walkthrough = fs.readFileSync(walkthroughFile, "utf8").split("\n");
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
    const input = getNextLine();
    if (!input) {
      process.exit(0);
    }
    process.stdout.write(input + "\n");
    game.continueAfterUserInput(input_state, input);
  }

  print(game: Game, str: string) {
    process.stdout.write(str);
  }

  quit() {
    process.exit(0);
  }
}

class TestRunnerStorage implements Storage {
  saveSnapshot(game: Game) {
    fs.writeFileSync("snapshot.dat", game.snapshotToBuffer(), {
      encoding: "binary",
    });
  }

  loadSnapshot(_game: Game) {
    const f = fs.readFileSync("snapshot.dat");
    const b = Buffer.from(f.buffer);
    return Game.readSnapshotFromBuffer(b);
  }
}

const log = new Log(false);
const game = new Game(
  fs.readFileSync(gameFile),
  log,
  new TestRunnerScreen(log),
  new TestRunnerStorage()
);

game.execute();
