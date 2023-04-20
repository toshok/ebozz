import path from "path";
import fs from "fs";

import { InputState } from "../types.js";

export default class BotStorage {
  private rootDir: string;
  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  directoryForChannel(channelId: string) {
    return path.join(this.rootDir, channelId);
  }

  ensureDirectoryForChannel(channelId: string) {
    const targetDir = this.directoryForChannel(channelId);
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      return targetDir;
    } catch (e) {
      if (e.code === "EEXIST") {
        return targetDir;
      }
      throw e;
    }
  }

  gameWaitingForInput(
    channelId: string,
    gameId: string,
    inputState: InputState,
    snapshot: Buffer
  ) {
    const targetDir = this.ensureDirectoryForChannel(channelId);
    const gameIdPath = path.join(targetDir, "gameId");
    const inputStatePath = path.join(targetDir, "inputState");
    const snapshotPath = path.join(targetDir, "snapshot.dat");

    fs.writeFileSync(gameIdPath, gameId, { encoding: "utf8" });
    fs.writeFileSync(inputStatePath, JSON.stringify(inputState), {
      encoding: "utf8",
    });
    fs.writeFileSync(snapshotPath, snapshot, { encoding: "binary" });
  }

  gameStoppedInChannel(channelId: string) {
    // this should rimraf the directory
    const targetDir = this.directoryForChannel(channelId);
    const gameIdPath = path.join(targetDir, "gameId");
    const inputStatePath = path.join(targetDir, "inputState");
    const snapshotPath = path.join(targetDir, "snapshot.dat");

    try {
      fs.unlinkSync(gameIdPath);
    } catch (e) {}

    try {
      fs.unlinkSync(inputStatePath);
    } catch (e) {}

    try {
      fs.unlinkSync(snapshotPath);
    } catch (e) {}
  }

  stateForChannel(channelId: string) {
    const targetDir = this.directoryForChannel(channelId);
    const gameIdPath = path.join(targetDir, "gameId");
    const inputStatePath = path.join(targetDir, "inputState");
    const snapshotPath = path.join(targetDir, "snapshot.dat");

    try {
      const gameId = fs.readFileSync(gameIdPath, "utf8").toString();
      const inputState = JSON.parse(
        fs.readFileSync(inputStatePath, "utf8").toString()
      );
      const snapshot = fs.readFileSync(snapshotPath);
      return { gameId, inputState, snapshot };
    } catch (e) {
      return null;
    }
  }
}
