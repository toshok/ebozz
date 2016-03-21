import * as colors from 'ansicolors';
import * as readline from 'readline-sync';
import * as fs from 'fs';

let file = process.argv[2];

let b = fs.readFileSync(file);

let pending_routines = [];
let done_routines = new Set(); // members are addresses

class Log {
    constructor(debug_flag) {
      this.debug_flag = debug_flag;
    }
    debug(msg) { if (this.debug_flag) console.warn(colors.blue(`[DEBUG] ${msg}`)); }
    info(msg) { }
    warn(msg) { console.warn(colors.red(`[WARN] ${msg}`)); }
    error(msg) { console.warn(colors.red(`[ERROR] ${msg}`)); }
}

let log = new Log(false);

function illegalOpcode() {
    return opcode("???", () => { throw new Error("illegal opcode"); });
}

function opcode(mnemonic, impl) {
    let wrapped_impl = (state, ...args) => {
        try {
            impl(state, ...args);
        }
        catch (e) {
            log.error(`exception executing: ${mnemonic}`);
            log.error(e.stack);
            process.exit(-1);
        }
    };

    return { mnemonic, impl: wrapped_impl };
}

function unimplemented() {
    throw new Error("unimplemented");
}

function nopcode() {
    return opcode('nop', () => {});
}

function object_has_attr(state, obj, attribute) {
    return false;
}

let op2 = [
    nopcode(),
    opcode('je', (state, a, b) => {
        let offset = state.getBranchOffset(state);
        log.debug(`je ${a.toString(16)} ${b.toString(16)} -> ${(state.pc + offset - 2).toString(16)}`);
        if (a === b)
            state.doBranch(offset);
    }),
    opcode('jl', (state, a, b) => {
        let offset = state.getBranchOffset(state);
        log.debug(`jl ${a.toString(16)} ${b.toString(16)} -> ${(state.pc + offset - 2).toString(16)}`);
        if (a < b)
            state.doBranch(offset);
    }),
    opcode('jg', (state, a, b) => {
        let offset = state.getBranchOffset(state);
        log.debug(`jg ${a.toString(16)} ${b.toString(16)} -> ${(state.pc + offset - 2).toString(16)}`);
        if (a > b)
            state.doBranch(offset);
    }),
    opcode('dec_chk', (state, variable, value) => {
        let offset = state.getBranchOffset(state);
        log.debug(`dec_chk ${variable.toString(16)} ${value}`);
        let new_val = state.loadVariable(variable) - 1;
        state.storeVariable(variable, new_val);
        log.debug(`******dec_check ${new_val} <? ${value}`);
        if (new_val < value)
            state.doBranch(offset);
    }),
    opcode('inc_chk', (state) => { unimplemented(); }),
    opcode('jin', (state, obj1, obj2) => {
        let offset = state.getBranchOffset(state);
        log.debug(`jin ${obj1.toString(16)} ${obj2.toString(16)} -> ${(state.pc + offset - 2).toString(16)}`);
        let o1 = GameObject.getObject(state, obj1);
        if (o1.parent.objnum === obj2)
            state.doBranch(offset);
    }),
    opcode('test', (state) => { unimplemented(); }),
    opcode('or', (state, a, b) => {
      let result = state.readByte();
      log.debug(`or ${a.toString(16)} ${b.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, a | b);
    }),
    opcode('and', (state) => { unimplemented(); }),
    opcode('test_attr', (state, obj, attribute) => {
        let offset = state.getBranchOffset(state);
        log.warn(`test_attr ${obj} ${attribute} -- not implemented`);
        if (object_has_attr(state, obj, attribute))
            state.doBranch(offset);
    }),
    opcode('set_attr', (state, obj, attribute) => {
        log.warn(`set_attr ${obj} ${attribute} -- not implemented`);
    }),
    opcode('clear_attr', (state, obj, attribute) => {
        log.warn(`clear_attr ${obj} ${attribute} -- not implemented`);
    }),
    opcode('store', (state, variable, value) => {
        log.debug(`store (${variable}) ${value}`);
        state.storeVariable(variable, value);
    }),
    opcode('insert_obj', (state, obj, destination) => {
        log.debug(`insert_obj ${obj} ${destination}`);
        let o = GameObject.getObject(obj);
        let do = GameObject.getObject(destination);
        if (o.parent) {
          // detach it from the list of children
          // XXX more here
        }
        else {
          // no parent, easy
          o.sibling = do.child;
          do.child = o;
        }
    }),
    opcode('loadw', (state, array, word_index) => {
      let result = state.readByte();
      log.debug(`loadw ${array.toString(16)} ${word_index.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, state.getWord(array + 2 * word_index));
    }),
    opcode('loadb', (state, array, byte_index) => {
      let result = state.readByte();
      log.debug(`loadb ${array.toString(16)} ${byte_index.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, state.getByte(array + byte_index));
    }),
    opcode('get_prop', (state, obj, property) => {
      let result = state.readByte();
      log.debug(`get_prop ${obj.toString(16)} ${property.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, state.getByte(array + byte_index));
    }),
    opcode('get_prop_addr', (state) => { unimplemented(); }),
    opcode('get_next_prop', (state) => { unimplemented(); }),
    opcode('add', (state, a, b) => {
      let result = state.readByte();
      log.debug(`add ${a.toString(16)} ${b.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, (a + b) | 0);
    }),
    opcode('sub', (state, a, b) => {
      let result = state.readByte();
      log.debug(`add ${a.toString(16)} ${b.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, (a - b) | 0);
    }),
    opcode('mul', (state, a, b) => {
      let result = state.readByte();
      log.debug(`mul ${a.toString(16)} ${b.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, (a * b) | 0);
    }),
    opcode('div', (state, a, b) => {
      let result = state.readByte();
      log.debug(`div ${a.toString(16)} ${b.toString(16)} -> (${result.toString(16)})`);
      state.storeVariable(result, (a / b) | 0);
    }),
    opcode('mod', (state, a, b, result) => { unimplemented(); }),
    opcode('call_2s', (state, routine, arg1) => {
        let result = state.readByte();
        routine *= 4; // routine is a packed address
        log.debug(`call_2s ${routine.toString(16)} ${arg1} -> (${result.toString(16)})`);
        state.callRoutine(routine, result, arg1);
    }),
    opcode('call_2n', (state, routine, arg1) => {
        log.debug(`call_2n ${routine.toString(16)} ${arg1}`);
        routine *= 4; // routine is a packed address
        state.callRoutine(routine, null, arg1);
    }),
    opcode('set_color', (state, foreground, background) => {
        log.warn(`set_color ${foreground} ${background} -- not implemented`);
    }),
    opcode('throw', (state) => { unimplemented(); }),
    illegalOpcode(),
    illegalOpcode(),
    illegalOpcode(),
];

let op1 = [
    opcode('jz', (state, a) => {
        let offset = state.getBranchOffset(state);
        log.debug(`jz ${a.toString(16)} -> ${(state.pc + offset - 2).toString(16)}`);
        if (a === 0)
            state.doBranch(offset);
    }),
    opcode('get_sibling', (state) => { unimplemented(); }),
    opcode('get_child', (state, obj) => {
        let result = state.readByte();
        let offset = state.getBranchOffset(state);
        log.debug(`get_child ${object.toString(16)} -> (${result.toString(16)}) ?${offset.toString(16)}`);

        let o = GameObject.getObject(state, obj);
        let child = o.child;
        if (child) {
            state.storeVariable(result, child.objnum)
            state.doBranch(offset);
        }
        else {
            state.storeVariable(result, 0)
        }
    }),
    opcode('get_parent', (state) => { unimplemented(); }),
    opcode('get_prop_len', (state) => { unimplemented(); }),
    opcode('inc', (state, variable) => {
        log.debug(`inc ${variable.toString(16)}`);
        state.storeVariable(variable, state.loadVariable(variable) + 1);
    }),
    opcode('dec', (state, variable) => {
        log.debug(`dec ${variable.toString(16)}`);
        state.storeVariable(variable, state.loadVariable(variable) - 1);
    }),
    opcode('print_addr', (state) => { unimplemented(); }),
    opcode('call_1s', (state, routine) => {
        let result = state.readByte();
        routine *= 4; // routine is a packed address
        log.debug(`call_1s ${routine.toString(16)} -> (${result.toString(16)})`);
        state.callRoutine(routine, result);
    }),
    opcode('remove_obj', (state) => { unimplemented(); }),
    opcode('print_obj', (state, obj) => {
        log.warn(`print_obj ${obj.toString(16)}`);
        let o = GameObject.getObject(state, obj);
        console.log(`>> ${o.name} <<`);
    }),
    opcode('ret', (state, value) => {
        state.returnFromRoutine(value);
    }),
    opcode('jump', (state, addr) => {
        let ab = new ArrayBuffer(2);
        let ui16 = new Uint16Array(ab);
        let i16 = new Int16Array(ab);
        ui16[0] = addr;
        state.pc = state.pc + i16[0] - 2;
    }),
    opcode('print_paddr', (state, packed_addr) => {
        console.log(zstringToAscii(state, state.getZString(packed_addr*4), true));
    }),
    opcode('load', (state) => { unimplemented(); }),
    opcode('not', (state, value) => {
        let result = state.readByte();
        value = value ^ 0xffff;
        state.storeVariable(result, value);
    }),
    opcode('call_1n', (state) => {
        routine *= 4; // routine is a packed address
        log.debug(`call_1n ${routine.toString(16)}`);
        state.callRoutine(routine, null);
    })
];

let alphabet_table = [
    /* A0 */ 'abcdefghijklmnopqrstuvwxyz',
    /* A1 */ 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    /* A2 */ ' \n0123456789.,!?_#\'"/\-:()'
];
function zstringToAscii(state, zstr, expand) {
    // various state things, like alphabet
    let alphabet = 0;

    function shiftAlphabet(stype) {
        if (stype === 4) alphabet = 1;
        else if (stype === 5) alphabet = 2;
        else
            throw new Error("unknown shift type");
    }

    let rv = [];
    for (let i = 0; i < zstr.length; i ++) {
        let z = zstr[i];
        if (z < 6) {
            switch (z) {
                case 0: rv.push(' '); break;
                case 1: case 2: case 3: {
                  let x = zstr[++i];
                  let entry = 32 * (z-1) + x;
                  let abbrev_addr = state.getWord(state._abbrevs + entry*2) * 2;
                  rv.push(...zstringToAscii(state, state.getZString(abbrev_addr), false));
                  break;
                }
                case 4: case 5: shiftAlphabet(z); break;
            }
        }
        else if (z == 6 && alphabet === 2) {
            // XXX Z-character 6 from A2 means that the two subsequent Z-characters specify a ten-bit ZSCII character code: the next Z-character gives the top 5 bits and the one after the bottom 5.


            // we ignore for now.
        }
        else {
            rv.push(alphabet_table[alphabet][z-6]);
            alphabet = 0;
        }
    }
    return rv.join('');
}

let op0 = [
    opcode('rtrue', (state) => { state.returnFromRoutine(1); }),
    opcode('rfalse', (state) => { state.returnFromRoutine(0); }),
    opcode('print', (state) => { console.log(zstringToAscii(state, state.readZString(), true)); }),
    opcode('print_ret', (state) => {
        console.log(zstringToAscii(state, state.readZString(), true));
        state.returnFromRoutine(1);
    }),
    nopcode(),
    opcode('save', (state) => { unimplemented(); }),
    opcode('restore', (state) => { unimplemented(); }),
    opcode('restart', (state) => { unimplemented(); }),
    opcode('ret_popped', (state) => { unimplemented(); }),
    opcode('pop', (state) => { unimplemented(); }),
    opcode('quit', (state) => { unimplemented(); }),
    opcode('new_line', (state) => { console.log(); }),
    opcode('show_status', (state) => { }),
    opcode('verify', (state) => { unimplemented(); }),
    opcode('extended', (state) => { unimplemented(); }),
    opcode('piracy', (state) => { unimplemented(); }),
];

let opv = [
    opcode('call', (state, routine, ...args) => {
        log.debug(`call ${args}`);
        let result = state.readByte();
        routine *= 4; // routine is a packed address
        state.callRoutine(routine, result, ...args);
    }),
    opcode('storew', (state, array, word_index, value) => {
      log.debug(`storew ${array.toString(16)} ${word_index.toString(16)} ${value.toString(16)}`);
      state.setWord(array + 2*word_index, value);
    }),
    opcode('storeb', (state, array, byte_index, value) => {
      log.debug(`storeb ${array.toString(16)} ${byte_index.toString(16)} ${value.toString(16)}`);
      state.setByte(array + byte_index, value);
    }),
    opcode('put_prop', (state, object, property, value) => {
        log.warn(`put_prop ${object} ${property} ${value} -- not implemented`);
    }),
    opcode('sread', (state, ...args) => { unimplemented(); }),
    opcode('print_char', (state, ...chars) => {
        log.debug(`print_char(${chars})`);
    }),
    opcode('print_num', (state, value) => {
        // XXX should convert to signed 16-bit
        console.log(value);
    }),
    opcode('random', (state, range) => {
        log.debug(`random(${range})`);
        let result = state.readByte();
        if (range <= 0) {
          // (XXX) can't seed in JS?
          state.storeVariable(result, 0);
        }
        else {
          let rv = Math.floor(Math.random() * range + 1);
          state.storeVariable(result, rv);
        }
    }),
    opcode('push', (state, value) => {
        state.pushStack(value);
    }),
    opcode('pull', (state, variable) => {
        state.storeVariable(variable, state.popStack());
    }),
    opcode('split_window', (state, lines) => {
        log.warn(`split_window ${lines} -- not implemented`);
    }),
    opcode('set_window', (state, window) => {
        log.warn(`set_window ${window} -- not implemented`);
    }),
    opcode('call_vs2', (state, ...args) => { unimplemented(); }),
    opcode('erase_window', (state, window) => {
        log.warn(`erase_window ${window} -- not implemented`);
    }),
    opcode('erase_line', (state, ...args) => { unimplemented(); }),
    opcode('set_cursor', (state, line, column, window) => {
        log.warn(`set_cursor ${line} x ${column}, ${window} -- not implemented`);
    }),
    opcode('get_cursor', (state, ...args) => { unimplemented(); }),
    opcode('set_text_style', (state, style) => {
        log.warn(`set_text_style ${style} -- no implemented`);
    }),
    opcode('buffer_mode', (state, flag) => {
        log.warn(`buffer_mode ${flag} -- not implemented`);
    }),
    opcode('output_stream', (state, ...args) => { unimplemented(); }),
    opcode('input_stream', (state, number) => {
        log.debug(`input_stream ${number}`);
        unimplemented();
    }),
    opcode('sound_effect', (state, ...args) => { unimplemented(); }),
    opcode('read_char', (state, dev, time, routine) => {
        let result = state.readByte();
        readline.keyIn('');
        state.storeVariable(result, 32/*XXX*/);
    }),
    opcode('scan_table', (state, ...args) => { unimplemented(); }),
    opcode('not', (state, ...args) => { unimplemented(); }),
    opcode('call_vn', (state, ...args) => { unimplemented(); }),
    opcode('call_vn2', (state, ...args) => { unimplemented(); }),
    opcode('tokenise', (state, ...args) => { unimplemented(); }),
    opcode('encode_text', (state, ...args) => { unimplemented(); }),
    opcode('copy_table', (state, ...args) => { unimplemented(); }),
    opcode('print_table', (state, zscii_text, width, height, skip) => {
      log.debug('print_table');
      if (width) printf (`width = ${width}`);
      if (height) printf (`height = ${height}`);
      if (skip) printf (`skip = ${skip}`);
    }),
    opcode('check_arg_count', (state, ...args) => { unimplemented(); }),
];

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
const INSTRUCTION_FORM_EXTENDED = 3;

function executeInstruction(state) {
    // If the top two bits of the opcode are $$11 the form is
    // variable; if $$10, the form is short. If the opcode is 190 ($BE
    // in hexadecimal) and the version is 5 or later, the form is
    // "extended". Otherwise, the form is "long".

    let op_pc = state.pc;
    let opcode = state.readByte();

    let operandTypes = [];
    let reallyVariable = false;
    let form;

    log.debug("opbyte = " + opcode);
    if ((opcode & 0xC0) === 0xC0) {
        form = INSTRUCTION_FORM_VARIABLE;

        if ((opcode & 0x20) !== 0) {
            reallyVariable = true;
        }
        else {
            // not really variable - 2 args
            log.debug("not really variable");
        }

        if (form === INSTRUCTION_FORM_VARIABLE) {
            let bits = state.readByte();
            for (let i = 0; i < 4; i++) {
                let optype = (bits >> ((3 - i) * 2)) & 0x03;
                if (optype !== OPERAND_TYPE_OMITTED) {
                    operandTypes.push(optype);
                }
                else {
                    break;
                }
            }
        }

        opcode = opcode & 0x1f;
    }
    else if ((opcode & 0x80) === 0x80) {
        form = INSTRUCTION_FORM_SHORT;

        let optype = (opcode & 0x30) >> 4;
        if (optype !== OPERAND_TYPE_OMITTED)
            operandTypes = [optype];

        opcode = opcode & 0x0f;
    }
    // XXX opcode == 190 and version >= 5
    else {
        form = INSTRUCTION_FORM_LONG;

        operandTypes.push((opcode & 0x40) === 0x40 ? OPERAND_TYPE_VARIABLE : OPERAND_TYPE_SMALL);
        operandTypes.push((opcode & 0x20) === 0x20 ? OPERAND_TYPE_VARIABLE : OPERAND_TYPE_SMALL);

        opcode = opcode & 0x1f;
    }

    log.debug(`[${op_pc.toString(16)}] opcode ${opcode}`);

    let operands = [];
    for (let optype of operandTypes) {
        if (optype === OPERAND_TYPE_LARGE) {
            let op = state.readWord();
            log.debug(`  large(${op})`);
            operands.push(op);
        }
        else if (optype === OPERAND_TYPE_SMALL) {
            let o = state.readByte();
            log.debug(`  small(${o})`);
            operands.push(o);
        }
        else if (optype === OPERAND_TYPE_VARIABLE) {
            let varnum = state.readByte();
            log.debug(`  var_ref(${varnum.toString(16)})`);
            operands.push(state.loadVariable(varnum));
        }
        else {
            //log.debug(optype);
            throw new Error("XXX");
        }
    }

    let impl;
    if (reallyVariable) {
        log.debug(`really variable?  operands = ${operands.length}`);
        //log.debug(`    [${op_pc}]   ${opv[opcode].mnemonic} ...`);
        impl = opv[opcode].impl;
    }
    else {
        switch (operands.length) {
        case 0: impl = op0[opcode].impl; break;
        case 1: impl = op1[opcode].impl; break;
        case 2: impl = op2[opcode].impl; break;
        case 3: impl = op3[opcode].impl; break;
        case 4: impl = op4[opcode].impl; break;
        default: throw new Error("unhandled number of operands");
        }
    }
    impl(state, ...operands);
}

const FLAGS_OFFSET = 0;
const PARENT_OFFSET = 4;
const SIBLING_OFFSET = 5;
const CHILD_OFFSET = 6;
const PROP_TABLE_ADDR_OFFSET = 7;

class GameObject {
    constructor(state, objnum) {
        this.state = state;
        this.objnum = objnum;
        this.objaddr = state._object_table + 62 + (objnum-1)*9
    }

    get name() { return zstringToAscii(this.state, this.state.getLenZString(this.propertyTableAddr), false) }

    get parent() { return GameObject.getObject(this.state, this.state.getByte(this.objaddr + GameObject.PARENT_OFFSET)); }
    set parent(po) {
        let pobjnum = (po === null) ? 0 : po.objnum;
        this.state.setByte(this.objaddr + GameObject.PARENT_OFFSET, pobjnum);
    }
    get child() { return GameObject.getObject(this.state, this.state.getByte(this.objaddr + GameObject.CHILD_OFFSET)); }
    set child(co) {
        let cobjnum = (co === null) ? 0 : co.objnum;
        this.state.setByte(this.objaddr + GameObject.CHILD_OFFSET, cobjnum);
    }
    get sibling() { return GameObject.getObject(this.state, this.state.getByte(this.objaddr + GameObject.SIBLING_OFFSET)); }
    set sibling(so) {
        let sobjnum = (so === null) ? 0 : so.objnum;
        this.state.setByte(this.objaddr + GameObject.SIBLING_OFFSET, sobjnum);
    }
    get propertyTableAddr() { return this.state.getWord(this.objaddr + GameObject.PROP_TABLE_ADDR_OFFSET); }

    static getObject(state, objnum) {
      if (objnum === 0) return null;
      return new GameObject(state, objnum);
    }
}

class Game {
    constructor(story_buffer) {
        this._mem = story_buffer;
        this._stack = [];
        this._callstack = [];
        this._global_vars = this.getWord(0x0C);
        this._abbrevs = this.getWord(0x18);
        this._object_table = this.getWord(0x0A);
    }

    set pc(addr) { this._pc = addr; }
    get pc() { return this._pc; }

    dumpHeader() {
        console.log("header:");
        console.log(`Z-code version:           ${this.getByte(0)}`);
        console.log(`Start PC:                 ${this.getWord(0x06).toString(16)}`);
        console.log(`Global variables address: ${this.getWord(0x0C).toString(16)}`);
        console.log(`Alphabet table address:   ${this.getWord(0x34).toString(16)}`);
        console.log(`Object table address:     ${this.getWord(0x0A).toString(16)}`);
    }

    execute() {
      this._pc = this.getWord(6);
      while(true) {
          executeInstruction(this);
      }
    }

    pushStack(v) {
        if (v === undefined || v === null) throw new Error("bad value on push");
        this._stack.push(v);
        log.debug(`**** after pushStack(${v}): ${this._stack}`);
    }
    popStack() {
        log.debug(`**** before popStack: ${this._stack}`);
        if (this._stack.length === 0) throw new Error("empty stack");
        return this._stack.pop();
    }

    storeVariable(v, value) {
      if (v === 0) {
          this.pushStack(value);
          return;
      }
      if (v < 16) {
        // local
        let cur_frame = this._callstack[this._callstack.length-1];
        if (v > cur_frame.locals.length) { throw new Error("no local"); }
        cur_frame.locals[v-1] = value;
      }
      else {
        // global
        this.setWord(this._global_vars + 2 * v - 16, value);
      }
    }

    loadVariable(v) {
      if (v === 0) {
          return this.popStack();
      }
      if (v < 16) {
        // local
        let cur_frame = this._callstack[this._callstack.length-1];
        if (v > cur_frame.locals.length) { throw new Error("no local"); }
        return cur_frame.locals[v-1];
      }
      else {
        // global
        return this.getWord(state._global_vars + 2 * (v - 16));
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
        this._pc += rv.length / 3 * 2;
        return rv;
    }

    getByte(addr) {
        if (addr < 0 || addr > this._mem.length) throw new Error("segfault");
        return this._mem[addr];
    }
    setByte(addr, b) {
        if (addr < 0 || addr > this._mem.length) throw new Error("segfault");
        this._mem[addr] = b;
    }
    getWord(addr) {
        if (addr < 0 || addr > this._mem.length) throw new Error("segfault");
        let ub = this._mem[addr+0];
        let lb = this._mem[addr+1];
        return ub * 256 + lb;
    }
    setWord(addr, value) {
        if (addr < 0 || addr > this._mem.length) throw new Error("segfault");
        let lb = value & 256;
        let ub = value >> 8;
        this._mem[addr+0] = ub;
        this._mem[addr+1] = lb;
    }
    getZString(addr) {
        let chars = [];
        while (true) {
            let w = this.getWord(addr);
            chars.push((w >> 10) & 0x1f,
                       (w >> 5)  & 0x1f,
                       (w >> 0)  & 0x1f);
            if ((w & 0x8000) !== 0) {
                break;
            }
            addr += 2;
        }
        return chars;
    }
    getLenZString(addr) {
        let len = this.getWord(addr); addr += 2;
        let chars = [];
        while (len-- > 0) {
            let w = this.getWord(addr);
            chars.push((w >> 10) & 0x1f,
                       (w >> 5)  & 0x1f,
                       (w >> 0)  & 0x1f);
            if ((w & 0x8000) !== 0) {
                log.warn("high bit found in length string.");
                break;
            }
            addr += 2;
        }
        return chars;
    }

    getBranchOffset() {
        let branchData = this.readByte();
        let offset;
        if ((branchData & 0x40) == 0x40) {
          log.debug("1 byte offset");
          offset = branchData & 0x3f;
        }
        else {
          log.debug("2 byte offset");
          offset = (branchData & 0x3F) * 256 + this.readByte();
        }
        return offset;
    }

    doBranch(offset) {
        if (offset === 0)
            this.returnFromRoutine(0);
        else if (offset === 1)
            this.returnFromRoutine(1);
        else
            this._pc = this._pc + offset - 2;
    }

    callRoutine(addr, rv_location, ...args) {
        // initialize locals
        let num_locals = this.getByte(addr++);
log.debug(`routine has ${num_locals} locals`);
        let locals = Array(num_locals);
        for (let i = 0; i < num_locals; i ++) {
            // XXX for versions >= 5 locals is just initialized with 0's
            locals[i] = this.getWord(addr);
log.debug(`  default[${i}] = ${locals[i]}`);
            addr += 2;
        }

        // args are passed by overwriting local
        for (let ai = 0; ai < Math.min(args.length, num_locals); ai ++) {
            locals[ai] = args[ai];
log.debug(`arg ${ai} was ${args[ai]}`);
        }

        let new_frame = {
            return_pc: this._pc,
            return_value_location: rv_location,
            locals
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
}

let state = new Game(b);
state.dumpHeader();

state.execute();
process.exit(v);
