# Miniswap

[![Build](https://github.com/alanshaw/miniswap/actions/workflows/build.yml/badge.svg)](https://github.com/alanshaw/miniswap/actions/workflows/build.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

Miniature Bitswap implementation, remote read only.

## Install

```
npm install miniswap
```

## Usage

```js
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'

const miniswap = new Miniswap(blockstore)

libp2p.handle(BITSWAP_PROTOCOL, miniswap.handler)
```

## Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/alanshaw/miniswap/issues)!

## License

Dual-licensed under [MIT + Apache 2.0](https://github.com/alanshaw/miniswap/blob/main/LICENSE.md)
