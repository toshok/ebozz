import GameObject from "./GameObject";
import SuspendForUserInput from "./SuspendForUserInput";

import { op0, op1, op2, op3, op4, opv } from "./opcodes";
import { toI16 } from "./cast16";
import { hex, dumpParsebuffer } from "./debug-helpers";

//  $$00    Large constant (0 to 65535)    2 bytes
//  $$01    Small constant (0 to 255)      1 byte
//  $$10    Variable                       1 byte
//  $$11    Omitted altogether             0 bytes
const OPERAND_TYPE_LARGE = 0;
const OPERAND_TYPE_SMALL = 1;
const OPERAND_TYPE_VARIABLE = 2;
const OPERAND_TYPE_OMITTED = 3;

const INSTRUCTION_FORM_LONG = 0;
const INSTRUCTION_FORM_SHORT = 1;
const INSTRUCTION_FORM_VARIABLE = 2;
//const INSTRUCTION_FORM_EXTENDED = 3;

export default class Game {
  constructor(story_buffer, log_impl, screen, storage) {
    this._mem = story_buffer;
    this._log = log_impl;
    this._screen = screen;
    this._storage = storage;
    this._quit = false;
    this._stack = [];
    this._callstack = [];
    this._version = this.getByte(0x00);
    this._highmem = this.getByte(0x04);
    this._global_vars = this.getWord(0x0c);
    this._abbrevs = this.getWord(0x18);
    this._object_table = this.getWord(0x0a);
    this._dict = this.getWord(0x08);

    this._log.info(`game version: ${this._version}`);

    if (this._version === 6 || this._version === 7) {
      this._routine_offset = this.getWord(0x28);
      this._strings_offset = this.getWord(0x2a);
    }

    this._game_objects = [];

    this._mem[0x20] = 0xff; // 255 = infinite height
    this._mem[0x21] = 80; // XXX 80-character wide terminal

    // turn off split screen

    // get the word separators out of the dictionary here so we don't have to do it
    // every time we tokenise below.
  }

  static fromSnapshot(snapshotBuffer, ...ctorArgs) {
    let { mem, stack, callstack, pc } = Game.readSnapshotFromBuffer(
      snapshotBuffer
    );
    let g = new Game(mem, ...ctorArgs);
    g._stack = stack;
    g._callstack = callstack;
    g._pc = pc;
    return g;
  }

  snapshotToBuffer() {
    console.log(
      `at snapshot time, mem is length ${this._mem.length}, and pc = ${this.pc}`
    );
    const chunkHeader = (type, length) => {
      let b = Buffer.alloc(8);
      b.writeUInt32LE(type, 0);
      b.writeUInt32LE(length, 4);
      return b;
    };

    let buffers = [];
    buffers.push(chunkHeader(1, this._mem.length));
    buffers.push(this._mem);

    let stackString = JSON.stringify(this._stack);
    buffers.push(chunkHeader(2, stackString.length));
    buffers.push(Buffer.from(stackString, "utf8"));

    let callstackString = JSON.stringify(this._callstack);
    buffers.push(chunkHeader(3, callstackString.length));
    buffers.push(Buffer.from(callstackString, "utf8"));

    buffers.push(chunkHeader(4, 4));
    let b = Buffer.alloc(4);
    b.writeUInt32LE(this._pc);
    buffers.push(b);

    return Buffer.concat(buffers);
  }

  static readSnapshotFromBuffer(b) {
    let mem, stack, callstack, pc;
    let p = 0;

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
        case 4: // registers
          pc = b.readUInt32LE(p);
          break;
      }
      p += length;
    };

    // we write four chunks so far
    readChunk();
    readChunk();
    readChunk();
    readChunk();

    console.log(
      `at snapshot time, mem is length ${mem.length}, and pc = ${pc}`
    );

    return {
      mem,
      stack,
      callstack,
      pc
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
      this._storage.saveSnapshot(this, this._mem, this._stack, this._callstack);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  restoreGame() {
    try {
      let { mem, stack, callstack } = this._storage.loadSnapshot(this);
      this._mem = mem;
      this._stack = stack;
      this._callstack = callstack;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  continueAfterUserInput(input_state, input) {
    // probably not fully necessary, but unwind back to the event loop before transfering
    // back to game code.
    let timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);

      input = input.toLowerCase();

      let { textBuffer, parseBuffer } = input_state;

      let max_input = this.getByte(textBuffer);
      if (this._version <= 4) {
        // we have to append a terminator character, so the amount of allowed user input is 1 less.
        max_input--;
      }
      input = input.slice(0, max_input);

      for (let i = 0, e = input.length; i < e; i++) {
        let c = input.charCodeAt(i);
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
        this._log.error("sread doesn't store the last key (return) anywhere");
      }

      this.executeLoop();
    });
  }

  execute() {
    this._pc = this.getWord(6);
    this.executeLoop();
  }

  executeLoop() {
    try {
      while (!this._quit) {
        this._op_pc = this._pc;
        this.executeInstruction();
      }
    } catch (e) {
      if (e instanceof SuspendForUserInput) {
        // use setTimeout so we fully unwind before calling the input_cb
        let timeoutId = setTimeout(() => {
          clearTimeout(timeoutId);
          try {
            this._screen.getInputFromUser(this, e.state);
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

    let op_pc = this.pc;
    let opcode = this.readByte();

    let operandTypes = [];
    let reallyVariable = false;
    let form;

    this._log.debug("opbyte = " + opcode);

    if ((opcode & 0xc0) === 0xc0) {
      form = INSTRUCTION_FORM_VARIABLE;

      if ((opcode & 0x20) !== 0) {
        reallyVariable = true;
      } else {
        // not really variable - 2 args
      }

      if (form === INSTRUCTION_FORM_VARIABLE) {
        let bits = this.readByte();
        for (let i = 0; i < 4; i++) {
          let optype = (bits >> ((3 - i) * 2)) & 0x03;
          if (optype !== OPERAND_TYPE_OMITTED) {
            operandTypes.push(optype);
          } else {
            break;
          }
        }
      }

      opcode = opcode & 0x1f;
    } else if ((opcode & 0x80) === 0x80) {
      form = INSTRUCTION_FORM_SHORT;

      let optype = (opcode & 0x30) >> 4;
      if (optype !== OPERAND_TYPE_OMITTED) {
        operandTypes = [optype];
      }

      opcode = opcode & 0x0f;
    }
    // XXX opcode == 190 and version >= 5
    else {
      form = INSTRUCTION_FORM_LONG;

      operandTypes.push(
        (opcode & 0x40) === 0x40 ? OPERAND_TYPE_VARIABLE : OPERAND_TYPE_SMALL
      );
      operandTypes.push(
        (opcode & 0x20) === 0x20 ? OPERAND_TYPE_VARIABLE : OPERAND_TYPE_SMALL
      );

      opcode = opcode & 0x1f;
    }

    let operands = [];
    for (let optype of operandTypes) {
      if (optype === OPERAND_TYPE_LARGE) {
        let op = this.readWord();
        operands.push(op);
      } else if (optype === OPERAND_TYPE_SMALL) {
        let o = this.readByte();
        operands.push(o);
      } else if (optype === OPERAND_TYPE_VARIABLE) {
        let varnum = this.readByte();
        let varval = this.loadVariable(varnum);
        operands.push(varval);
      } else {
        throw new Error("XXX");
      }
    }

    let impl;
    try {
      if (reallyVariable) {
        impl = opv[opcode].impl;
      } else {
        switch (operands.length) {
          case 0:
            impl = op0[opcode].impl;
            break;
          case 1:
            impl = op1[opcode].impl;
            break;
          case 2:
            impl = op2[opcode].impl;
            break;
          case 3:
            impl = op3[opcode].impl;
            break;
          case 4:
            impl = op4[opcode].impl;
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
    impl(this, ...operands);
  }

  unpackRoutineAddress(addr) {
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

  unpackStringAddress(addr, _for_call) {
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

  getObject(objnum) {
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

  pushStack(v) {
    if (v === undefined || v === null) {
      throw new Error("bad value on push");
    }
    this._stack.push(v);
    this._log.debug(
      `     after pushStack(${hex(v)}): ${this._stack.map(el => hex(el))}`
    );
  }
  popStack() {
    this._log.debug(`     before popStack: ${this._stack.map(el => hex(el))}`);
    if (this._stack.length === 0) {
      throw new Error("empty stack");
    }
    return this._stack.pop();
  }
  peekStack() {
    this._log.debug(`     before peekStack: ${this._stack.map(el => hex(el))}`);
    if (this._stack.length === 0) {
      throw new Error("empty stack");
    }
    return this._stack[this._stack.length - 1];
  }

  storeVariable(v, value, replaceTop = false) {
    if (v === 0) {
      if (replaceTop) {
        this.popStack();
      }
      this.pushStack(value);
      return;
    }
    if (v < 16) {
      // local
      let cur_frame = this._callstack[this._callstack.length - 1];
      if (v > cur_frame.locals.length) {
        throw new Error(
          `local ${v} out of range.  there are ${
            cur_frame.locals.length
          } locals`
        );
      }
      cur_frame.locals[v - 1] = value;
    } else {
      // global
      this.setWord(this._global_vars + 2 * (v - 16), value);
    }
  }

  loadVariable(variable, peekTop = false) {
    if (variable === 0) {
      if (peekTop) {
        return this.peekStack();
      }
      return this.popStack();
    }
    if (variable < 16) {
      // local
      let cur_frame = this._callstack[this._callstack.length - 1];
      if (variable > cur_frame.locals.length) {
        throw new Error("no local");
      }
      return cur_frame.locals[variable - 1];
    } else {
      // global
      return this.getWord(this._global_vars + 2 * (variable - 16));
    }
  }

  readByte() {
    let rv = this.getByte(this._pc);
    this._pc++;
    return rv;
  }
  readWord() {
    let rv = this.getWord(this._pc);
    this._pc += 2;
    return rv;
  }
  readZString() {
    let rv = this.getZString(this._pc);
    this._pc += Math.floor((rv.length / 3) * 2);
    return rv;
  }

  getByte(addr) {
    if (addr < 0 || addr >= this._mem.length) {
      throw new Error("segfault");
    }
    return this._mem[addr];
  }
  setByte(addr, b) {
    if (addr < 0 || addr >= this._mem.length) {
      throw new Error("segfault");
    }
    this._mem[addr] = b;
  }
  getWord(addr) {
    if (addr < 0 || addr > this._mem.length) {
      throw new Error("segfault");
    }
    let ub = this._mem[addr + 0];
    let lb = this._mem[addr + 1];
    return ub * 256 + lb;
  }
  setWord(addr, value) {
    if (addr < 0 || addr > this._mem.length) {
      throw new Error("segfault");
    }
    let lb = value & 255;
    let ub = value >> 8;
    this._mem[addr + 0] = ub;
    this._mem[addr + 1] = lb;
  }
  getZString(addr) {
    let chars = [];
    while (true) {
      let w = this.getWord(addr);
      chars.push((w >> 10) & 0x1f, (w >> 5) & 0x1f, (w >> 0) & 0x1f);
      if ((w & 0x8000) !== 0) {
        break;
      }
      addr += 2;
    }
    return chars;
  }
  getLenZString(addr) {
    let len = this.getByte(addr);
    addr++;
    let chars = [];
    while (len-- > 0) {
      let w = this.getWord(addr);
      chars.push((w >> 10) & 0x1f, (w >> 5) & 0x1f, (w >> 0) & 0x1f);
      if ((w & 0x8000) !== 0) {
        this._log.warn("high bit found in length string.");
        break;
      }
      addr += 2;
    }
    return chars;
  }

  readBranchOffset() {
    let branchData = this.readByte();
    let off1 = branchData & 0x3f;
    let offset;
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

  doBranch(cond, condfalse, offset) {
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
        this._log.debug(`     taking branch to ${this._pc}!`);
      }
    }
  }

  callRoutine(addr, rv_location, ...args) {
    if (addr === 0) {
      this.storeVariable(rv_location, 0);
      return;
    }
    // initialize locals
    let num_locals = this.getByte(addr++);
    let locals = Array(num_locals);
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

    let new_frame = {
      return_pc: this._pc,
      return_value_location: rv_location,
      locals,
      arg_count: args.length
    };

    this._callstack.push(new_frame);
    this._pc = addr;
  }
  returnFromRoutine(value) {
    let popped_frame = this._callstack.pop();
    if (popped_frame.return_value_location !== null) {
      this.storeVariable(popped_frame.return_value_location, value);
    }
    this._pc = popped_frame.return_pc;
  }

  getArgCount() {
    let cur_frame = this._callstack[this._callstack.length - 1];
    return cur_frame.arg_count;
  }

  lookupToken(dict, encoded_token_words) {
    // skip the separators
    let num_sep = this.getByte(dict);
    dict += num_sep + 1;

    let entry_len = this.getByte(dict);
    dict++;

    let num_entries = this.getWord(dict);
    dict += 2;
    if (num_entries < 0) {
      // the entries aren't sorted, linear search
      let lower = 0;
      let upper = -num_entries - 1;
      while (lower <= upper) {
        let entry_addr = dict + lower * entry_len;

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
      let cmp_entry = Math.floor((lower + upper) / 2);
      let entry_addr = dict + cmp_entry * entry_len;

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
  encodeToken(text, padding = 0x05) {
    this._log.debug(`encodeToken(${text})`);
    let resolution = this._version > 3 ? 3 : 2;

    // chop it off at 6 characters (the max)
    text = text.slice(0, 6);
    let zchars = [];

    for (let i = 0; i < text.length; i++) {
      if (text[i] < "a" || text[i] > "z") {
        throw new Error("encodeToken is too dumb");
      }
      zchars.push(text.charCodeAt(i) - "a".charCodeAt(0) + 6);
    }
    while (zchars.length < 6) {
      zchars.push(padding);
    }

    let zwords = [];

    for (let i = 0; i < resolution; i++) {
      zwords.push(
        (zchars[3 * i + 0] << 10) | (zchars[3 * i + 1] << 5) | zchars[3 * i + 2]
      );
    }
    zwords[resolution - 1] |= 0x8000;

    this._log.debug(`returning ${zwords}`);
    return zwords;
  }

  tokenise_word(inputbuffer, start, end, parsebuffer) {
    // the parse buffer contains as the first two bytes
    // [0]: max tokens
    // [1]: count tokens
    // max tokens is supplied to us, and we fill in count tokens

    let max_tokens = this.getByte(parsebuffer);

    let count_tokens = this.getByte(parsebuffer + 1);
    if (count_tokens >= max_tokens) {
      return;
    }

    let wordtext = inputbuffer.slice(start, end).toLowerCase();
    let tokenword = this.encodeToken(wordtext);
    //this._log.warn(`tokenise_word "${wordtext} (${hex(tokenword[0])},${hex(tokenword[1])})"`);

    let token_addr = this.lookupToken(this._dict, tokenword);
    //this._log.warn(`address for ${wordtext} == ${hex(token_addr)}`);
    if (token_addr !== 0) {
      let token_storage = 4 * count_tokens + 2 + parsebuffer;
      this.setByte(parsebuffer + 1, ++count_tokens);
      this.setWord(token_storage, token_addr);
      this.setByte(token_storage + 2, end - start);
      this.setByte(token_storage + 3, start + 1);
    }
  }

  tokeniseText(textBuffer, length, from, parseBuffer, dict, flag) {
    let token_max, token_count;

    token_max = this.getByte(parseBuffer);
    token_count = this.getByte(parseBuffer + 1);

    if (token_count >= token_max) {
      // no space for more tokens
      return;
    }

    this.setByte(parseBuffer + 1, token_count + 1);

    // frotz decodes then encodes again.  not sure why.
    let wordZChars = [];
    for (let i = 0; i < length; i++) {
      wordZChars.push(String.fromCharCode(this.getByte(textBuffer + from + i)));
    }

    let tokenword = this.encodeToken(wordZChars.join(""));
    let token_addr = this.lookupToken(this._dict, tokenword);
    if (token_addr !== 0 || !flag) {
      let token_storage = 4 * token_count + parseBuffer + 2;
      this.setWord(token_storage, token_addr);
      this.setByte(token_storage + 2, length);
      this.setByte(token_storage + 3, from);
    }
  }

  tokeniseLine(textBuffer, parseBuffer, dict, flag) {
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
      let sep_addr;
      let sep_count;
      let separator;

      addr1++;

      // fetch next character
      if (this._version >= 5 && addr === textBuffer + 2 + length) {
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
        this.tokeniseText(textBuffer, 1, addr1 - text, parseBuffer, dict, flag);
      }
    } while (c != 0);
  }

  tokenise(inputtext, parsebuffer) {
    // clean parsebuffer by setting count_tokens == 0
    this.setByte(parsebuffer + 1, 0);

    let num_sep = this.getByte(this._dict);
    let sep_zscii = [];
    for (let i = 0; i < num_sep; i++) {
      sep_zscii.push(this.getByte(this._dict + 1 + i));
    }

    this._log.debug(
      `sep_zscii = ${sep_zscii.map(ch => String.fromCharCode(ch))}`
    );

    function is_separator(c) {
      return sep_zscii.indexOf(c.charCodeAt(0)) !== -1;
    }

    const CHAR_CLASS_SPACE = 2;
    const CHAR_CLASS_SEP = 1;
    const CHAR_CLASS_WORD = 0;

    function char_class(c) {
      if (c === " ") {
        return CHAR_CLASS_SPACE;
      }
      if (is_separator(c)) {
        return CHAR_CLASS_SEP;
      }
      return CHAR_CLASS_WORD;
    }

    let split_string = inputtext.split("");
    let classes = split_string.map(char_class);
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
}
