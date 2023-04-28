#!/usr/bin/env node
import * as fs from "fs";

import {
  Game,
  Log,
  ScreenBase,
  InputState,
  Storage,
  randomSeed,
} from "./core/index.js";
import GAMES from "./games.js";

class Suite {
  toRun: Array<{
    gameId: string;
    game: Buffer;
    walkthrough: Array<string>;
  }>;

  constructor(gameSpecs: Array<string>) {
    // build up a list of game files to run and walkthrough files to use from the gameSpecs array.
    //
    // each spec can be one of two forms:
    // 1. <gameId> - in which case we look for the key in GAMES to find the game file
    // 2. <gameId>:<gameFile> - in which case we use the game file directly.
    //
    // in both cases we use the walkthrough located at <gameId>.walkthrough.
    // if any of the files are missing (or if the id is not in GAMES) we skip it.
    // if the gameSpecs array is empty we run all the games in GAMES
    this.toRun = [];
    if (gameSpecs.length) {
      gameSpecs.forEach((spec) => {
        const [gameId, gameFile] = spec.split(":");
        const game = GAMES[gameId];
        if (!game) {
          return;
        }
        if (!gameFile && !game.path) {
          return;
        }
        const walkthroughFile = `tests/${gameId}.walkthrough`;
        if (!fs.existsSync(walkthroughFile)) {
          return;
        }
        this.toRun.push({
          gameId,
          game: fs.readFileSync(gameFile || game.path),
          walkthrough: fs.readFileSync(walkthroughFile, "utf8").split("\n"),
        });
      });
    } else {
      Object.keys(GAMES).forEach((gameId) => {
        const game = GAMES[gameId];
        if (!game.path) {
          return;
        }
        const walkthroughFile = `tests/${gameId}.walkthrough`;
        if (!fs.existsSync(walkthroughFile)) {
          return;
        }
        this.toRun.push({
          gameId,
          game: fs.readFileSync(game.path),
          walkthrough: fs.readFileSync(walkthroughFile, "utf8").split("\n"),
        });
      });
    }
  }

  run() {
    this.toRun.forEach((toRun) => {
      const { gameId, game, walkthrough } = toRun;
      const runner = new Test(gameId, game, walkthrough);
      runner.run();
    });
  }
}

class Test {
  gameId: string;
  game: Buffer;
  walkthrough: Array<string>;
  cursor: number;
  skip: boolean;
  randomSeed: string | undefined;

  constructor(gameId: string, game: Buffer, walkthrough: Array<string>) {
    this.gameId = gameId;
    this.game = game;
    this.walkthrough = walkthrough;
    this.cursor = 0;
    this.skip = false;
    this.randomSeed = undefined;

    this.readHeader();
  }

  readHeader(): void {
    let line: string;
    do {
      line = this.walkthrough[this.cursor].trim();
      if (line[0] !== "#") {
        break;
      }
      this.cursor++;
      if (line.startsWith("# @randomSeed:")) {
        this.randomSeed = line.substring(14);
      }
      if (line === "# @skip") {
        this.skip = true;
      }
    } while (line[0] === "#");
  }

  getNextLine() {
    let line: string;
    do {
      if (this.cursor === this.walkthrough.length) {
        return;
      }
      line = this.walkthrough[this.cursor++].trim();
    } while (line === "" || line[0] === "#");
    return line;
  }

  run(): void {
    if (this.skip) {
      console.log(`Skipping test ${this.gameId}...`);
      return;
    }

    console.log(`Running test ${this.gameId}...`);

    if (this.randomSeed !== undefined) {
      randomSeed(this.randomSeed);
    }

    const log = new Log(false);
    const game = new Game(
      this.game,
      log,
      new TestRunnerScreen(this, log),
      new TestRunnerStorage(this)
    );

    game.execute();
  }
}

class TestRunnerScreen extends ScreenBase {
  test: Test;
  outHandle: number;

  constructor(test: Test, log: Log) {
    super(log, "TestRunnerScreen");
    this.test = test;
    this.outHandle = fs.openSync(`tests/${test.gameId}.out.actual`, "w");
  }

  getInputFromUser(game: Game, input_state: InputState) {
    const input = this.test.getNextLine();
    if (!input) {
      // don't exit here, since we're running multiple games now.  need to figure out a way
      // to signal to the suite that we're done.
      // process.exit(0);
      console.log(`done with input for ${this.test.gameId}.`);
      return;
    }
    fs.writeSync(this.outHandle, input + "\n");
    game.continueAfterUserInput(input_state, input);
  }

  print(game: Game, str: string) {
    fs.writeSync(this.outHandle, str);
  }

  quit() {
    fs.closeSync(this.outHandle);
    // don't exit here, since we're running multiple games now.  need to figure out a way
    // to signal to the suite that we're done.
    // process.exit(0);
    console.log(`done with ${this.test.gameId}.`);
    return;
  }
}

class TestRunnerStorage implements Storage {
  test: Test;
  constructor(test: Test) {
    this.test = test;
  }
  saveSnapshot(game: Game) {
    fs.writeFileSync(
      `${this.test.gameId}-snapshot.dat`,
      game.snapshotToBuffer(),
      {
        encoding: "binary",
      }
    );
  }

  loadSnapshot(_game: Game) {
    const f = fs.readFileSync(`${this.test.gameId}-snapshot.dat`);
    const b = Buffer.from(f.buffer);
    return Game.readSnapshotFromBuffer(b);
  }
}

// the actual running of the tests here
const gameSpecs = process.argv.slice(2);
const suite = new Suite(gameSpecs);
suite.run();
