import Log from './log';
import Game from './ebozz';

import * as readline from 'readline-sync';
import * as fs from 'fs';
import nopt from 'nopt';

let knownOpts = {
    '--debug' : Boolean,
    '--noExec': Boolean,
    '--header': Boolean,
    '--objectTree': Boolean,
    '--dict': Boolean,
};
let shorthandOpts = {
    'd': ['--debug'],
    'n': ['--noExec'],
    'h': ['--header'],
    'o': ['--objectTree'],
    't': ['--dict'],
    'dump': ['--header', '--objectTree', '--dict', '-n'],
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

game = new Game(b, log,
                (input_state) => {
                    game.continueAfterUserInput(input_state, readline.question(''));
                },
                (str) => {
                    process.stdout.write(str);
                });

if (parsed.header)
    game.dumpHeader();

if (parsed.objectTree)
    game.dumpObjectTable();

if (parsed.dict)
    game.dumpDictionary();

if (!parsed.noExec)
    game.execute();

process.exit(0);

