#!/usr/bin/env node
import Log from "./log";
import Game from "./ebozz";

import * as readline from "readline-sync";
import * as fs from "fs";
import nopt from "nopt";

let knownOpts = {
  "--debug": Boolean,
  "--noExec": Boolean,
  "--header": Boolean,
  "--objectTree": Boolean,
  "--dict": Boolean
};
let shorthandOpts = {
  d: ["--debug"],
  n: ["--noExec"],
  h: ["--header"],
  o: ["--objectTree"],
  t: ["--dict"],
  dump: ["--header", "--objectTree", "--dict", "-n"]
};

let parsed = nopt(knownOpts, shorthandOpts, process.argv, 2);

let file = parsed.argv.remain[0];

if (!file) {
  console.error("must specify path to z-machine story file");
  process.exit(0);
}

let b = fs.readFileSync(file);

let log = new Log(parsed.debug);
let game;

game = new Game(
  b,
  log,
  input_state => {
    let input = readline.question("");
    game.continueAfterUserInput(input_state, input);
  },
  str => {
    process.stdout.write(str);
  },
  (mem, stack, callstack) => {
    const chunkHeader = (type, length) => {
      let b = Buffer.alloc(8);
      b.writeUInt32LE(type, 0);
      b.writeUInt32LE(length, 4);
      return b;
    };

    let buffers = [];
    buffers.push(chunkHeader(1, mem.length));
    buffers.push(mem);

    let stackString = JSON.stringify(stack);
    buffers.push(chunkHeader(2, stackString.length));
    buffers.push(Buffer.from(stackString, "utf8"));

    let callstackString = JSON.stringify(callstack);
    buffers.push(chunkHeader(3, callstackString.length));
    buffers.push(Buffer.from(callstackString, "utf8"));

    fs.writeFileSync("snapshot.dat", Buffer.concat(buffers), {
      encoding: "binary"
    });
  },
  () => {
    let f = fs.readFileSync("snapshot.dat");
    let p = 0;

    let b = Buffer.from(f.buffer);

    let mem, stack, callstack;

    let readChunk = () => {
      let type = b.readUInt32LE(p);
      p += 4;
      let length = b.readUInt32LE(p);
      p += 4;

      switch (type) {
        case 1: // memory
          mem = b.slice(p, p + length);
          break;
        case 2: // stack
          stack = JSON.parse(b.toString("utf8", p, p + length));
          break;
        case 3: // callstack
          callstack = JSON.parse(b.toString("utf8", p, p + length));
          break;
      }
      p += length;
    };

    // we write three chunks so far
    readChunk();
    readChunk();
    readChunk();

    return {
      mem,
      stack,
      callstack
    };
  }
);

if (parsed.header) game.dumpHeader();

if (parsed.objectTree) game.dumpObjectTable();

if (parsed.dict) game.dumpDictionary();

if (!parsed.noExec) game.execute();
