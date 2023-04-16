# ebozz

ebozz is a Z-machine interpreter written in typescript.

## Building/playing

```
$ yarn
$ yarn build
$ yarn fetch-games
$ yarn zork1
yarn run v1.22.19
$ node dist/console gamefiles/zork1-r119-s880429.z3
[INFO] game version: 3
ZORK I: The Great Underground Empire
Infocom interactive fiction - a fantasy story
Copyright (c) 1981, 1982, 1983, 1984, 1985, 1986 Infocom, Inc. All rights reserved.
ZORK is a registered trademark of Infocom, Inc.
Release 119 / Serial number 880429

West of House
You are standing in an open field west of a white house, with a boarded front door.
There is a small mailbox here.

>
```

## What story files work with it

Anything <= version 3 should at least show text and respond to input.  I have yet to play through any game completely.

## Why?

I wanted to play Trinity (version 4, so still not working), and wanted a task that felt smaller than some of the things I have to do for toshok/echojs.

## License

MIT.  do whatever you want with it.
