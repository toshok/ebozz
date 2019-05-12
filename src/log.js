import chalk from "chalk";

export default class Log {
  constructor(debug_flag) {
    this.debug_flag = debug_flag;
  }

  _debug(msg) {
    return Boolean(process.stdout.isTTY) ? chalk.blueBright(msg) : msg;
  }
  _info(msg) {
    return Boolean(process.stdout.isTTY) ? chalk.greenBright(msg) : msg;
  }
  _warn(msg) {
    return Boolean(process.stdout.isTTY) ? chalk.red(msg) : msg;
  }
  _error(msg) {
    return Boolean(process.stdout.isTTY) ? chalk.redBright(msg) : msg;
  }

  debug(msg) {
    if (this.debug_flag) {
      console.log(this._debug(`[DEBUG] ${msg}`));
    }
  }
  info(msg) {
    console.log(this._debug(`[INFO] ${msg}`));
  }
  warn(msg) {
    console.log(this._warn(`[WARN] ${msg}`));
  }
  error(msg) {
    console.log(this._error(`[ERROR] ${msg}`));
  }
}
