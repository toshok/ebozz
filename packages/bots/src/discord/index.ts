import DiscordBot from "./bot.js";

const bot = new DiscordBot(process.env.DISCORD_TOKEN || "");
bot.run();
