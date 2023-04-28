import chalk from "chalk";

export default class Log {
  private debugFlag: boolean;
  constructor(debugFlag: boolean) {
    this.debugFlag = debugFlag;
  }

  _debug(msg: string) {
    return Boolean(process.stdout.isTTY) ? chalk.blueBright(msg) : msg;
  }
  _info(msg: string) {
    return Boolean(process.stdout.isTTY) ? chalk.greenBright(msg) : msg;
  }
  _warn(msg: string) {
    return Boolean(process.stdout.isTTY) ? chalk.red(msg) : msg;
  }
  _error(msg: string) {
    return Boolean(process.stdout.isTTY) ? chalk.redBright(msg) : msg;
  }

  debug(msg: string) {
    if (this.debugFlag) {
      console.log(this._debug(`[DEBUG] ${msg}`));
    }
  }
  info(msg: string) {
    console.log(this._info(`[INFO] ${msg}`));
  }
  warn(msg: string) {
    console.log(this._warn(`[WARN] ${msg}`));
  }
  error(msg: string) {
    console.log(this._error(`[ERROR] ${msg}`));
  }
}
