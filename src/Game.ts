import type {
  CallFrame,
  Address,
  ZString,
  Storage,
  InputState,
  SnapshotData,
} from "./types.js";
import type { Screen } from "./Screen.js";
import GameObject from "./GameObject.js";
import SuspendForUserInput from "./SuspendForUserInput.js";

import { Opcode, op0, op1, op2, op3, op4, opv } from "./opcodes.js";
import { toI16 } from "./cast16.js";
import { hex, dumpParsebuffer } from "./debug-helpers.js";
import Log from "./log.js";

enum OperandType {
  //  $$00    Large constant (0 to 65535)    2 bytes
  Large = 0,

  //  $$01    Small constant (0 to 255)      1 byte
  Small = 1,

  //  $$10    Variable                       1 byte
  Variable = 2,

  //  $$11    Omitted altogether             0 bytes
  Omitted = 3,
}

enum InstructionForm {
  Long = 0,
  Short = 1,
  Variable = 2,
  Extended = 3,
}

// some known globals addresses used to populate the status bar for versions 1
// to 3.  globals 1 and 2 switch meaning depending on if the game is a "score
// game" or a "time game".
enum KnownGlobals {
  Location = 0,
  // for score games:
  Score = 1,
  NumTurns = 2,
  // for time games:
  Hours = 1,
  Minutes = 2,
}

enum HeaderLocation {
  Version = 0x00,
  Flags1 = 0x01,
  HighMemBase = 0x04,
  InitialPC = 0x06,
  Dictionary = 0x08,
  ObjectTable = 0x0a,
  GlobalVariables = 0x0c,
  StaticMemBase = 0x0e,
  Flags2 = 0x10,
  AbbreviationsTable = 0x18,

  InterpreterNumber = 0x1e,
  InterpreterVersion = 0x1f,

  ScreenHeightInLines = 0x20,
  ScreenWidthInChars = 0x21,
  ScreenWidthInUnits = 0x22,
  ScreenHeightInUnits = 0x24,
  // more version 5/6 stuff after this

  RoutinesOffset = 0x28,
  StaticStringsOffset = 0x2a,
}

enum SnapshotChunkType {
  Memory = 1,
  Stack = 2,
  Callstack = 3,
  Registers = 4,
}
export default class Game {
  private _pc: Address;
  private _stack: Array<number>;
  /*private*/ _callstack: Array<CallFrame>;
  private _op_pc: Address;

  private _mem: Buffer;
  /*private*/ _log: Log;
  /*private*/ _screen: Screen;
  private _storage: Storage;
  /*private*/ _quit: boolean;
  /*private*/ _version: number;
  private _highmem: number;
  private _global_vars: number;
  /*private*/ _abbrevs: number;
  /*private*/ _object_table: number;
  /*private*/ _dict: number;

  private _routine_offset: number;
  private _strings_offset: number;
  private _game_objects: Array<GameObject>;

  constructor(
    story_buffer: Buffer,
    log: Log,
    screen: Screen,
    storage: Storage
  ) {
    this._mem = story_buffer;
    this._log = log;
    this._screen = screen;
    this._storage = storage;
    this._quit = false;
    this._stack = [];
    this._callstack = [];
    this._version = this.getByte(HeaderLocation.Version);
    this._highmem = this.getByte(HeaderLocation.HighMemBase);
    this._global_vars = this.getWord(HeaderLocation.GlobalVariables);
    this._abbrevs = this.getWord(HeaderLocation.AbbreviationsTable);
    this._object_table = this.getWord(HeaderLocation.ObjectTable);
    this._dict = this.getWord(HeaderLocation.Dictionary);

    this._log.info(`game version: ${this._version}`);

    if (this._version === 6 || this._version === 7) {
      this._routine_offset = this.getWord(HeaderLocation.RoutinesOffset);
      this._strings_offset = this.getWord(HeaderLocation.StaticStringsOffset);
    }

    this._game_objects = [];

    // tell the game about our screen size
    const { rows, cols } = screen.getSize();
    this._mem[HeaderLocation.ScreenHeightInLines] = rows;
    this._mem[HeaderLocation.ScreenWidthInChars] = cols;

    // tell the game about our font size
    // turn off split screen

    // tell the game some things about our capabilities by setting our flags in
    // the header.
    const screenCapabilities = this._screen.getCapabilities();
    let flags1 = this.getByte(HeaderLocation.Flags1);
    if (this._version <= 3) {
      // bits 4/5/6 are the ones we'll be filling in, so clear them first
      flags1 &= 0b10001111;
      if (screenCapabilities.hasDisplayStatusBar) {
        flags1 |= 0b00010000; // bit 4
      }
      if (screenCapabilities.hasSplitWindow) {
        flags1 |= 0b00100000; // bit 5
      }
      // XXX for now always leave bit 6 cleared, which signals that a variable
      // width font is not the default.
    } /* this._version >= 4 */ else {
      // we're filling in all bits but bit 6, so clear them first
      flags1 &= 0b01000000;
      if (screenCapabilities.hasColors) {
        flags1 |= 0b00000001; // bit 0
      }
      if (screenCapabilities.hasPictures) {
        flags1 |= 0b00000010; // bit 1
      }
      if (screenCapabilities.hasBold) {
        flags1 |= 0b00000100; // bit 2
      }
      if (screenCapabilities.hasItalic) {
        flags1 |= 0b00001000; // bit 3
      }
      if (screenCapabilities.hasFixedPitch) {
        flags1 |= 0b00010000; // bit 4
      }
      if (screenCapabilities.hasSound) {
        flags1 |= 0b00100000; // bit 5
      }
      if (screenCapabilities.hasTimedKeyboardInput) {
        flags1 |= 0b01000000; // bit 7
      }
    }
    this.setByte(HeaderLocation.Flags1, flags1);

    // get the word separators out of the dictionary here so we don't have to do it
    // every time we tokenise below.
  }

  static fromSnapshot(
    snapshotBuffer: Buffer,
    log: Log,
    screen: Screen,
    storage: Storage
  ) {
    const { mem, stack, callstack, pc } =
      Game.readSnapshotFromBuffer(snapshotBuffer);
    const g = new Game(mem, log, screen, storage);
    g._stack = stack;
    g._callstack = callstack;
    g._pc = pc;
    return g;
  }

  snapshotToBuffer(): Buffer {
    console.log(
      `at snapshot save time, mem is length ${this._mem.length}, and pc = ${this.pc}`
    );
    const chunkHeader = (type: SnapshotChunkType, length: number): Buffer => {
      const b = Buffer.alloc(8);
      b.writeUInt32LE(type, 0);
      b.writeUInt32LE(length, 4);
      return b;
    };

    const buffers: Array<Buffer> = [];
    buffers.push(chunkHeader(SnapshotChunkType.Memory, this._mem.length));
    buffers.push(this._mem);

    const stackString = JSON.stringify(this._stack);
    buffers.push(chunkHeader(SnapshotChunkType.Stack, stackString.length));
    buffers.push(Buffer.from(stackString, "utf8"));

    const callstackString = JSON.stringify(this._callstack);
    buffers.push(
      chunkHeader(SnapshotChunkType.Callstack, callstackString.length)
    );
    buffers.push(Buffer.from(callstackString, "utf8"));

    buffers.push(chunkHeader(SnapshotChunkType.Registers, 4));
    const b = Buffer.alloc(4);
    b.writeUInt32LE(this._pc);
    buffers.push(b);

    return Buffer.concat(buffers);
  }

  static readSnapshotFromBuffer(b: Buffer): SnapshotData {
    let mem: Buffer | null = null;
    let stack: Array<number> | null = null;
    let callstack: Array<CallFrame> | null = null;
    let pc: number | null = null;

    let p = 0;

    const readChunk = () => {
      const type = b.readUInt32LE(p) as SnapshotChunkType;
      p += 4;
      const length = b.readUInt32LE(p);
      p += 4;

      switch (type) {
        case SnapshotChunkType.Memory:
          mem = Uint8Array.prototype.slice.call(b, p, p + length);
          break;
        case SnapshotChunkType.Stack:
          stack = JSON.parse(b.toString("utf8", p, p + length));
          break;
        case SnapshotChunkType.Callstack:
          callstack = JSON.parse(b.toString("utf8", p, p + length));
          break;
        case SnapshotChunkType.Registers:
          pc = b.readUInt32LE(p);
          break;
        default:
          throw new Error(`unknown chunk type ${type}`);
      }
      p += length;
    };

    while (p < b.length) {
      readChunk();
    }

    let memToUse: Buffer;
    if (mem === null) {
      throw new Error("couldn't find memory chunk in snapshot");
    } else {
      memToUse = mem;
    }

    let stackToUse: Array<number>;
    if (stack === null) {
      throw new Error("couldn't find stack chunk in snapshot");
    } else {
      stackToUse = stack;
    }

    let callstackToUse: Array<CallFrame>;
    if (callstack === null) {
      throw new Error("couldn't find callstack chunk in snapshot");
    } else {
      callstackToUse = callstack;
    }

    let pcToUse: number;
    if (pc === null) {
      throw new Error("couldn't find registers chunk in snapshot");
    } else {
      pcToUse = pc;
    }

    console.log(
      `at snapshot load time, mem is length ${memToUse.length}, and pc = ${pcToUse}`
    );

    return {
      mem: memToUse,
      stack: stackToUse,
      callstack: callstackToUse,
      pc: pcToUse,
    };
  }

  set pc(addr) {
    this._pc = addr;
  }
  get pc() {
    return this._pc;
  }

  get op_pc() {
    return this._op_pc;
  }

  saveGame() {
    try {
      this._storage.saveSnapshot(this);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  restoreGame() {
    try {
      const { mem, stack, callstack } = this._storage.loadSnapshot(this);
      this._mem = mem;
      this._stack = stack;
      this._callstack = callstack;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  continueAfterKeyPress(input_state: InputState, _key: string) {
    if (!input_state.keyPress) {
      throw new Error("continueAfterKeyPress called for non-keypress");
    }
    setImmediate(() => {
      const { resultVar } = input_state;
      // XXX(toshok) this is almost certainly wrong, but until we support input that doesn't require the enter
      // key to be hit, feels like an okay compromise?
      this.storeVariable(resultVar, 0x0d /*XXX*/);

      this.executeLoop();
    });
  }

  continueAfterUserInput(input_state: InputState, input: string) {
    if (input_state.keyPress) {
      throw new Error("continueAfterUserInput called for keypress");
    }
    // probably not fully necessary, but unwind back to the event loop before transfering
    // back to game code.
    setImmediate(() => {
      input = input.toLowerCase();

      const { textBuffer, parseBuffer, resultVar } = input_state;
      if (textBuffer === undefined) {
        throw new Error("textBuffer undefined");
      }
      if (parseBuffer === undefined) {
        throw new Error("parseBuffer undefined");
      }

      let max_input = this.getByte(textBuffer);
      if (this._version <= 4) {
        // we have to append a terminator character, so the amount of allowed user input is 1 less.
        max_input--;
      }
      input = input.slice(0, max_input);

      for (let i = 0, e = input.length; i < e; i++) {
        const c = input.charCodeAt(i);
        // XXX(toshok) convert `c` to zscii.  for now assume we're dealing with ascii anyway and just
        // pass it through.

        this.setByte(textBuffer + (this._version <= 4 ? 1 : 2) + i, c);
      }

      if (this._version <= 4) {
        // store our terminating \0
        this.setByte(textBuffer + 1 + input.length, 0);
      } else {
        // store the length of the string at offset 1.  no terminator in these versions.
        this.setByte(textBuffer + 1, input.length);
      }

      this.tokeniseLine(textBuffer, parseBuffer, 0, false);

      if (this._version >= 5) {
        // >= v5 stores the terminating input key

        // XXX(toshok) this is almost certainly wrong, but until we support input that doesn't require the enter
        // key to be hit, feels like an okay compromise?
        this.storeVariable(resultVar, 0x0d);
      }

      this.executeLoop();
    });
  }

  execute() {
    this._pc = this.getWord(HeaderLocation.InitialPC);
    this.executeLoop();
  }

  executeLoop() {
    try {
      while (!this._quit) {
        this._op_pc = this._pc;
        this.executeInstruction();
      }
      this._screen.quit();
    } catch (e) {
      if (e instanceof SuspendForUserInput) {
        // unwind before calling the screen input function
        setImmediate(() => {
          try {
            if (e.state.keyPress) {
              this._screen.getKeyFromUser(this, e.state);
            } else {
              this._screen.getInputFromUser(this, e.state);
            }
          } catch (e) {
            console.error(e);
          }
        });
      } else {
        console.error(e);
      }
    }
  }

  executeInstruction() {
    // If the top two bits of the opcode are $$11 the form is
    // variable; if $$10, the form is short. If the opcode is 190 ($BE
    // in hexadecimal) and the version is 5 or later, the form is
    // "extended". Otherwise, the form is "long".

    const op_pc = this.pc;
    let opcode = this.readByte();

    let operandTypes: Array<number /* OperandType */> = [];
    let reallyVariable = false;
    let form: InstructionForm;

    this._log.debug(`${op_pc.toString(16)}: opbyte = ${opcode}`);
    // console.error(`[DEBUG] ${op_pc.toString(16)}: opbyte = ${opcode}`);

    if ((opcode & 0xc0) === 0xc0) {
      form = InstructionForm.Variable;

      if ((opcode & 0x20) !== 0) {
        reallyVariable = true;
      } else {
        // not really variable - 2 args
      }

      if (form === InstructionForm.Variable) {
        const bits = this.readByte();
        for (let i = 0; i < 4; i++) {
          const optype = (bits >> ((3 - i) * 2)) & 0x03;
          if (optype !== OperandType.Omitted) {
            operandTypes.push(optype);
          } else {
            break;
          }
        }
      }

      opcode = opcode & 0x1f;
    } else if ((opcode & 0x80) === 0x80) {
      form = InstructionForm.Short;

      const optype = (opcode & 0x30) >> 4;
      if (optype !== OperandType.Omitted) {
        operandTypes = [optype];
      }

      opcode = opcode & 0x0f;
    } else if (opcode === 190 && this._version >= 5) {
      throw new Error("extended opcodes not implemented");
    } else {
      form = InstructionForm.Long;

      operandTypes.push(
        (opcode & 0x40) === 0x40 ? OperandType.Variable : OperandType.Small
      );
      operandTypes.push(
        (opcode & 0x20) === 0x20 ? OperandType.Variable : OperandType.Small
      );

      opcode = opcode & 0x1f;
    }

    const operands: Array<number> = [];
    for (const optype of operandTypes) {
      switch (optype) {
        case OperandType.Large:
          operands.push(this.readWord());
          break;
        case OperandType.Small:
          operands.push(this.readByte());
          break;
        case OperandType.Variable:
          const varnum = this.readByte();
          operands.push(this.loadVariable(varnum));
          break;
        default:
          throw new Error("XXX");
      }
    }

    let op: Opcode;
    try {
      if (reallyVariable) {
        op = opv[opcode];
      } else {
        switch (operands.length) {
          case 0:
            op = op0[opcode];
            break;
          case 1:
            op = op1[opcode];
            break;
          case 2:
            op = op2[opcode];
            break;
          case 3:
            op = op3[opcode];
            break;
          case 4:
            op = op4[opcode];
            break;
          default:
            throw new Error("unhandled number of operands");
        }
      }
    } catch (e) {
      console.error(e);
      this._log.error(
        `error at pc=${hex(op_pc)}, opcode=${hex(opcode)}: ${e.toString()}`
      );
      throw e;
    }
    this._log.debug(`op = ${op.mnemonic}`);
    /*
    if (this._callstack.length > 0) {
      console.log(this._callstack[this._callstack.length - 1].locals);
    }
    */
    op.impl(this, ...operands);
  }

  unpackRoutineAddress(addr: Address) {
    if (this._version <= 3) {
      return 2 * addr;
    } else if (this._version <= 5) {
      return 4 * addr;
    } else if (this._version <= 7) {
      return 4 * addr + this._routine_offset;
    } else if (this._version == 8) {
      return 8 * addr;
    } else {
      throw new Error("unknown version");
    }
  }

  unpackStringAddress(addr: Address /*, _for_call*/) {
    if (this._version <= 3) {
      return 2 * addr;
    } else if (this._version <= 5) {
      return 4 * addr;
    } else if (this._version <= 7) {
      return 4 * addr + this._strings_offset;
    } else if (this._version == 8) {
      return 8 * addr;
    } else {
      throw new Error("unknown version");
    }
  }

  getObject(objnum: number): GameObject | null {
    if (objnum === 0) {
      return null;
    }

    if (
      (this._version <= 3 && objnum > 255) ||
      (this._version >= 4 && objnum > 65535)
    ) {
      throw new Error(`Invalid object number ${objnum}`);
    }

    let cached_obj = this._game_objects[objnum];
    if (!cached_obj) {
      this._game_objects[objnum] = cached_obj = new GameObject(this, objnum);
    }
    return cached_obj;
  }

  pushStack(v: number): void {
    if (v === undefined || v === null) {
      throw new Error("bad value on push");
    }
    this._stack.push(v);
    this._log.debug(
      `     after pushStack(${hex(v)}): ${this._stack.map((el) => hex(el))}`
    );
  }
  popStack(): number {
    this._log.debug(
      `     before popStack: ${this._stack.map((el) => hex(el))}`
    );
    const v = this._stack.pop();
    if (v === undefined) {
      return 0;
      // throw new Error("empty stack");
    }
    return v;
  }
  peekStack(): number {
    this._log.debug(
      `     before peekStack: ${this._stack.map((el) => hex(el))}`
    );
    if (this._stack.length === 0) {
      throw new Error("empty stack");
    }
    return this._stack[this._stack.length - 1];
  }

  storeVariable(v: number, value: number, replaceTop = false) {
    if (v === 0) {
      if (replaceTop) {
        this.popStack();
      }
      this.pushStack(value);
      return;
    }
    if (v < 16) {
      // local
      const cur_frame = this._callstack[this._callstack.length - 1];
      if (v > cur_frame.locals.length) {
        throw new Error(
          `local ${v} out of range.  there are ${cur_frame.locals.length} locals`
        );
      }
      // console.log(`variable ${v - 1} = ${value}`);
      cur_frame.locals[v - 1] = value;
    } else {
      // global
      this.setWord(this._global_vars + 2 * (v - 16), value);
    }
  }

  loadVariable(variable: number, peekTop = false) {
    if (variable === 0) {
      if (peekTop) {
        return this.peekStack();
      }
      return this.popStack();
    }
    if (variable < 16) {
      // local
      const cur_frame = this._callstack[this._callstack.length - 1];
      if (variable > cur_frame.locals.length) {
        throw new Error("no local");
      }
      return cur_frame.locals[variable - 1];
    } else {
      // global
      return this.getWord(this._global_vars + 2 * (variable - 16));
    }
  }

  readByte(): number {
    const rv = this.getByte(this._pc);
    this._pc++;
    return rv;
  }
  readWord(): number {
    const rv = this.getWord(this._pc);
    this._pc += 2;
    return rv;
  }
  readZString(): ZString {
    const rv = this.getZString(this._pc);
    this._pc += Math.floor((rv.length / 3) * 2);
    return rv;
  }

  getByte(addr: Address): number {
    if (addr < 0 || addr >= this._mem.length) {
      throw new Error(`segfault: ${addr}`);
    }
    return this._mem[addr];
  }
  setByte(addr: Address, b: number): void {
    if (addr < 0 || addr >= this._mem.length) {
      throw new Error(`segfault: ${addr}`);
    }
    this._mem[addr] = b;
  }
  getWord(addr: Address): number {
    if (addr < 0 || addr > this._mem.length) {
      throw new Error(`segfault: ${addr}`);
    }
    const ub = this._mem[addr + 0];
    const lb = this._mem[addr + 1];
    return ub * 256 + lb;
  }
  setWord(addr: Address, value: number): void {
    if (addr < 0 || addr > this._mem.length) {
      throw new Error(`segfault: ${addr}`);
    }
    const lb = value & 255;
    const ub = value >> 8;
    this._mem[addr + 0] = ub;
    this._mem[addr + 1] = lb;
  }
  getZString(addr: Address): ZString {
    const chars: Array<number> = [];
    while (true) {
      const w = this.getWord(addr);
      chars.push((w >> 10) & 0x1f, (w >> 5) & 0x1f, (w >> 0) & 0x1f);
      if ((w & 0x8000) !== 0) {
        break;
      }
      addr += 2;
    }
    return chars;
  }
  getLenZString(addr: Address): ZString {
    let len = this.getByte(addr);
    addr++;
    const chars: Array<number> = [];
    while (len-- > 0) {
      const w = this.getWord(addr);
      chars.push((w >> 10) & 0x1f, (w >> 5) & 0x1f, (w >> 0) & 0x1f);
      if ((w & 0x8000) !== 0) {
        this._log.warn("high bit found in length string.");
        break;
      }
      addr += 2;
    }
    return chars;
  }

  readBranchOffset(): [number, boolean] {
    const branchData = this.readByte();
    let off1 = branchData & 0x3f;
    let offset: number;
    if ((branchData & 0x40) == 0x40) {
      // 1 byte offset
      offset = off1;
    } else {
      // 2 byte offset
      // propagate sign bit
      if ((off1 & 0x20) !== 0) {
        off1 |= 0xc0;
      }

      offset = toI16((off1 << 8) | this.readByte());
    }
    return [offset, (branchData & 0x80) === 0x00];
  }

  doBranch(cond: boolean, condfalse: boolean, offset: number) {
    this._log.debug(`     ${cond} ${!condfalse} ${offset}`);
    if ((cond && !condfalse) || (!cond && condfalse)) {
      if (offset === 0) {
        this._log.debug("     returning false");
        this.returnFromRoutine(0);
      } else if (offset === 1) {
        this._log.debug("     returning true");
        this.returnFromRoutine(1);
      } else {
        this._pc = this._pc + offset - 2;
        if (this._pc < 0 || this._pc > this._mem.length) {
          throw new Error("branch out of bounds");
        }
        this._log.debug(`     taking branch to ${this._pc}!`);
      }
    }
  }

  callRoutine(
    addr: Address,
    rv_location: number | null,
    ...args: Array<number>
  ) {
    // initialize locals
    const num_locals = this.getByte(addr++);
    const locals = Array(num_locals);
    if (this._version >= 5) {
      for (let i = 0; i < num_locals; i++) {
        locals[i] = 0;
      }
    } else {
      for (let i = 0; i < num_locals; i++) {
        locals[i] = this.getWord(addr);
        addr += 2;
      }
    }

    // args are passed by overwriting local
    for (let ai = 0; ai < Math.min(args.length, num_locals); ai++) {
      locals[ai] = args[ai];
    }

    const new_frame: CallFrame = {
      method_pc: addr,
      return_pc: this._pc,
      return_value_location: rv_location,
      locals,
      arg_count: args.length,
    };

    if (addr === 0x676f) {
      console.log(new_frame);
    }
    this._callstack.push(new_frame);
    this._pc = addr;
  }
  returnFromRoutine(value: number) {
    const popped_frame = this._callstack.pop();
    if (popped_frame === undefined) {
      throw new Error("callstack empty in return");
    }
    if (popped_frame.return_value_location !== null) {
      this.storeVariable(popped_frame.return_value_location, value);
    }
    this._pc = popped_frame.return_pc;
  }

  getArgCount() {
    const cur_frame = this._callstack[this._callstack.length - 1];
    return cur_frame.arg_count;
  }

  lookupToken(dict: number, encoded_token_words: Array<number>) {
    // skip the separators
    const num_sep = this.getByte(dict);
    dict += num_sep + 1;

    const entry_len = this.getByte(dict);
    dict++;

    const num_entries = this.getWord(dict);
    dict += 2;
    if (num_entries < 0) {
      // the entries aren't sorted, linear search
      const lower = 0;
      const upper = -num_entries - 1;
      while (lower <= upper) {
        const entry_addr = dict + lower * entry_len;

        let c = this.getWord(entry_addr) - encoded_token_words[0];
        if (c === 0) {
          c = this.getWord(entry_addr + 2) - encoded_token_words[1];
        }
        if (this._version > 3 && c === 0) {
          c = this.getWord(entry_addr + 4) - encoded_token_words[2];
        }
        if (c === 0) {
          return entry_addr;
        }
      }
      return 0; // not found
    }

    // sorted case, binary search
    let lower = 0;
    let upper = num_entries - 1;
    while (lower <= upper) {
      const cmp_entry = Math.floor((lower + upper) / 2);
      const entry_addr = dict + cmp_entry * entry_len;

      let c = this.getWord(entry_addr) - encoded_token_words[0];
      if (c === 0) {
        c = this.getWord(entry_addr + 2) - encoded_token_words[1];
      }
      if (this._version > 3 && c === 0) {
        c = this.getWord(entry_addr + 4) - encoded_token_words[2];
      }
      if (c < 0) {
        // entry is < encoded, pick upper half
        lower = cmp_entry + 1;
      } else if (c > 0) {
        // entry is > encoded, pick lower half
        upper = cmp_entry - 1;
      }
      // entry === encoded, done.
      else {
        return entry_addr;
      }
    }
    return 0; // not found
  }

  // XXX(toshok) woefully inadequate, but should handle ascii + separators
  encodeToken(text: string, padding = 0x05) {
    this._log.debug(`encodeToken(${text})`);
    const resolution = this._version > 3 ? 3 : 2;

    // chop it off at 6 characters (the max)
    text = text.slice(0, 6);
    const zchars: Array<number> = [];

    for (let i = 0; i < text.length; i++) {
      /*
      if (text[i] < "a" || text[i] > "z") {
        throw new Error("encodeToken is too dumb");
      }
      zchars.push(text.charCodeAt(i) - "a".charCodeAt(0) + 6);
      */
      let charCode = text.charCodeAt(i);
      if (text[i] >= "a" && text[i] <= "z") {
        charCode = charCode - "a".charCodeAt(0) + 6;
      }
      zchars.push(charCode);
    }
    while (zchars.length < 6) {
      zchars.push(padding);
    }

    const zwords: Array<number> = [];

    for (let i = 0; i < resolution; i++) {
      zwords.push(
        (zchars[3 * i + 0] << 10) | (zchars[3 * i + 1] << 5) | zchars[3 * i + 2]
      );
    }
    zwords[resolution - 1] |= 0x8000;

    this._log.debug(`returning ${zwords}`);
    return zwords;
  }

  tokenise_word(
    inputbuffer: string,
    start: number,
    end: number,
    parsebuffer: number
  ) {
    // the parse buffer contains as the first two bytes
    // [0]: max tokens
    // [1]: count tokens
    // max tokens is supplied to us, and we fill in count tokens

    const max_tokens = this.getByte(parsebuffer);

    let count_tokens = this.getByte(parsebuffer + 1);
    if (count_tokens >= max_tokens) {
      return;
    }

    const wordtext = inputbuffer.slice(start, end).toLowerCase();
    const tokenword = this.encodeToken(wordtext);
    //this._log.warn(`tokenise_word "${wordtext} (${hex(tokenword[0])},${hex(tokenword[1])})"`);

    const token_addr = this.lookupToken(this._dict, tokenword);
    //this._log.warn(`address for ${wordtext} == ${hex(token_addr)}`);
    if (token_addr !== 0) {
      const token_storage = 4 * count_tokens + 2 + parsebuffer;
      this.setByte(parsebuffer + 1, ++count_tokens);
      this.setWord(token_storage, token_addr);
      this.setByte(token_storage + 2, end - start);
      this.setByte(token_storage + 3, start + 1);
    }
  }

  tokeniseText(
    textBuffer: Address,
    length: number,
    from: number,
    parseBuffer: Address,
    dict: number,
    flag: boolean
  ) {
    const token_max = this.getByte(parseBuffer);
    const token_count = this.getByte(parseBuffer + 1);

    if (token_count >= token_max) {
      // no space for more tokens
      return;
    }

    this.setByte(parseBuffer + 1, token_count + 1);

    // frotz decodes then encodes again.  not sure why.
    const wordZChars: Array<string> = [];
    for (let i = 0; i < length; i++) {
      wordZChars.push(String.fromCharCode(this.getByte(textBuffer + from + i)));
    }

    const tokenword = this.encodeToken(wordZChars.join(""));
    const token_addr = this.lookupToken(this._dict, tokenword);
    if (token_addr !== 0 || !flag) {
      const token_storage = 4 * token_count + parseBuffer + 2;
      this.setWord(token_storage, token_addr);
      this.setByte(token_storage + 2, length);
      this.setByte(token_storage + 3, from);
    }
  }

  tokeniseLine(
    textBuffer: number,
    parseBuffer: number,
    dict: number,
    flag: boolean
  ) {
    // default to the standard dictionary
    if (dict === 0) {
      dict = this._dict;
    }

    // reset token count to 0
    this.setByte(parseBuffer + 1, 0);

    let addr1 = textBuffer;
    let addr2 = 0;
    let length = 0;

    if (this._version >= 5) {
      addr1++; // skip the max length byte
      length = this.getByte(addr1);
    }

    let c;
    do {
      let sep_addr: Address;
      let sep_count: number;
      let separator: number;

      addr1++;

      // fetch next character
      if (this._version >= 5 && addr1 === textBuffer + 2 + length) {
        c = 0;
      } else {
        c = this.getByte(addr1);
      }

      // check for separator
      sep_addr = dict;
      sep_count = this.getByte(sep_addr++);
      do {
        separator = this.getByte(sep_addr++);
      } while (c != separator && --sep_count != 0);

      /* This could be the start or the end of a word */

      if (sep_count == 0 && c != 32 && c != 0) {
        if (addr2 == 0) {
          addr2 = addr1;
        }
      } else if (addr2 != 0) {
        this.tokeniseText(
          textBuffer,
          addr1 - addr2,
          addr2 - textBuffer,
          parseBuffer,
          dict,
          flag
        );

        addr2 = 0;
      }

      if (sep_count != 0) {
        this.tokeniseText(
          textBuffer,
          1,
          addr1 - textBuffer,
          parseBuffer,
          dict,
          flag
        );
      }
    } while (c != 0);
  }

  tokenise(inputtext: string, parsebuffer: number) {
    // clean parsebuffer by setting count_tokens == 0
    this.setByte(parsebuffer + 1, 0);

    const num_sep = this.getByte(this._dict);
    const sep_zscii: Array<number> = [];
    for (let i = 0; i < num_sep; i++) {
      sep_zscii.push(this.getByte(this._dict + 1 + i));
    }

    this._log.debug(
      `sep_zscii = ${sep_zscii.map((ch) => String.fromCharCode(ch))}`
    );

    function is_separator(c: string) {
      return sep_zscii.indexOf(c.charCodeAt(0)) !== -1;
    }

    const CHAR_CLASS_SPACE = 2;
    const CHAR_CLASS_SEP = 1;
    const CHAR_CLASS_WORD = 0;

    function char_class(c: string) {
      if (c === " ") {
        return CHAR_CLASS_SPACE;
      }
      if (is_separator(c)) {
        return CHAR_CLASS_SEP;
      }
      return CHAR_CLASS_WORD;
    }

    const split_string = inputtext.split("");
    const classes = split_string.map(char_class);
    for (let start = 0; start < classes.length; start++) {
      if (classes[start] === CHAR_CLASS_SPACE) {
        continue;
      }
      if (classes[start] === CHAR_CLASS_SEP) {
        this.tokenise_word(inputtext, start, start + 1, parsebuffer);
        continue;
      }

      let end;

      for (end = start + 1; end < classes.length; end++) {
        if (classes[end] !== CHAR_CLASS_WORD) {
          this.tokenise_word(inputtext, start, end, parsebuffer);
          start = end - 1;
          break;
        }
      }

      if (end === classes.length) {
        this.tokenise_word(inputtext, start, end, parsebuffer);
        break;
      }
    }

    dumpParsebuffer(this, parsebuffer);
  }

  updateStatusBar() {
    if (this._version >= 4) {
      return;
    }

    const isScoreGame =
      this._version < 3 || (this.getByte(HeaderLocation.Flags1) & 0x02) == 0;

    const location = this.getWord(
      this._global_vars + 2 * KnownGlobals.Location
    );
    // we're going to fill in left and right sides of status bar
    const lhs = this.getObject(location)?.name || "Unknown location";
    let rhs: string;
    if (isScoreGame) {
      const score = this.getWord(this._global_vars + 2 * KnownGlobals.Score);
      const moves = this.getWord(this._global_vars + 2 * KnownGlobals.NumTurns);

      rhs = `Score: ${score}   Moves: ${moves} `;
    } else {
      const hours = this.getWord(this._global_vars + 2 * KnownGlobals.Hours);
      const minutes = this.getWord(
        this._global_vars + 2 * KnownGlobals.Minutes
      );

      rhs = `Time: ${hours}:${minutes} `;
    }

    this._screen.updateStatusBar(lhs, rhs);
  }
}
