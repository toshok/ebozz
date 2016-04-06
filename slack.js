import Bot from 'slackbots';
import * as fs from 'fs';
import Game from './ebozz';
import Log from './log';

class EbozzBot extends Bot {
    constructor(token) {
        super({name: "ebozz", token});

        let output_buffer = '';
        let current_input_state;

        this.on('start', () => {
            this.user = this.users.filter((user) => user.name === this.name)[0];

            let game = new Game(fs.readFileSync('tests/zork1.dat'), new Log(false),
                                // game suspended waiting for user input
                                (input_state) => {
console.log(`posting ${output_buffer}`);
                                    this.postMessageToChannel('ebozz-testing', output_buffer);
                                    output_buffer = '';
console.log('setting input_state to', input_state);
console.log('and waiting until we get user input');
                                    current_input_state = input_state;
                                },
                                // output callback
                                (str) => { output_buffer += str; });

            this.on('message', (message) => {

                if (this.isChatMessage(message) &&
                    this.isChannelConversation(message) &&
                    !this.isFromMe(message)) {

console.log(message, current_input_state);
                    if (current_input_state) {
console.log('continuing game');
                        game.continueAfterUserInput(current_input_state, message.text);
                        current_input_state = null;
                    }
                    else {
                        this.postMessageToChannel('ebozz-testing', "not ready for input yet");
                    }
                }
            });

            game.execute();
        });
    }

    isChatMessage(message) {
        return message.type === 'message' && Boolean(message.text);
    }

    isChannelConversation(message) {
        return typeof message.channel === 'string' &&
            message.channel[0] === 'C';
    }

    isFromMe(message) {
        return message.bot_id === this.user.profile.bot_id;
    }
}

new EbozzBot(fs.readFileSync('../EBOZZ_SLACK_TOKEN').toString().trim());
