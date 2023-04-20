#!/usr/bin/env node

import EbozzBot from "./bot.js";

const bot = new EbozzBot(
  process.env.SLACK_SIGNING_SECRET || "",
  process.env.SLACK_BOT_TOKEN || "",
  process.env.SLACK_APP_TOKEN || ""
);
bot.run();
