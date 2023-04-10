#!/usr/bin/env node
import Log from "../log";
import Game from "../ebozz";
import BlessedScreen from "./blessed-screen";
import StdioScreen from "./stdio-screen";
import { dumpHeader, dumpDictionary, dumpObjectTable } from "../debug-helpers";

import * as fs from "fs";
import * as nopt from "nopt";

let knownOpts = {
  debug: Boolean,
  noExec: Boolean,
  header: Boolean,
  objectTree: Boolean,
  dict: Boolean,
  screen: ["blessed", "stdio"],
};
let shorthandOpts = {
  d: ["--debug"],
  n: ["--noExec"],
  h: ["--header"],
  o: ["--objectTree"],
  t: ["--dict"],
  dump: ["--header", "--objectTree", "--dict", "-n"],
};

let parsed = nopt(knownOpts, shorthandOpts, process.argv, 2);

let file = parsed.argv.remain[0];

if (!file) {
  console.error("must specify path to z-machine story file");
  process.exit(0);
}

let b = fs.readFileSync(file);

let log = new Log(parsed.debug);

let screen;
if (parsed.screen === "blessed") {
  screen = new BlessedScreen(log);
} else {
  screen = new StdioScreen(log);
}

let storage = {
  saveSnapshot(game) {
    fs.writeFileSync("snapshot.dat", game.snapshotToBuffer(), {
      encoding: "binary",
    });
  },

  loadSnapshot(_game) {
    let f = fs.readFileSync("snapshot.dat");
    return Game.readSnapshotFromBuffer(Buffer.from(f.buffer));
  },
};

let game = new Game(b, log, screen, storage);

if (parsed.header) {
  dumpHeader(game);
}

if (parsed.objectTree) {
  dumpObjectTable(game);
}

if (parsed.dict) {
  dumpDictionary(game);
}

if (!parsed.noExec) {
  game.execute();
}
