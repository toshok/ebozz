import type Game from "./ebozz";
import type GameObject from "./GameObject";
import Log from "./log";

export type FIXME = unknown;

export type Address = number;
export type ZSCII = number;
export type ZString = Array<ZSCII>;

export type InputState = {
    textBuffer: Address;
    parseBuffer: Address;
    resultVar: Address;
};

export type SnapshotData = {
  mem: Buffer;
  stack: Array<number>;
  callstack: Array<CallFrame>;
  pc: number;
};

export interface Storage {
  saveSnapshot(game: Game): void;
  loadSnapshot(    game: Game  ): SnapshotData;
}

export interface CallFrame {
    method_pc: number;
    return_pc: number;
    return_value_location: number;
    locals: Array<number>;
    arg_count: number;
}