import type Game from "./ebozz.js";

export type FIXME = unknown;

export type Address = number;
export type ZSCII = number;
export type ZString = Array<ZSCII>;

export type InputState = {
  // will be false for a "read" instruction, true for a "read_char" instruction
  keyPress: boolean;
  resultVar: number;

  // will only be filled in for keyPress === false
  textBuffer?: number;
  parseBuffer?: number;
  time?: unknown;
  routine?: unknown;
};

export type SnapshotData = {
  mem: Buffer;
  stack: Array<number>;
  callstack: Array<CallFrame>;
  pc: number;
};

export interface Storage {
  saveSnapshot(game: Game): void;
  loadSnapshot(game: Game): SnapshotData;
}

export interface CallFrame {
  method_pc: number;
  return_pc: number;
  return_value_location: number | null; // why can this be null?
  locals: Array<number>;
  arg_count: number;
}
