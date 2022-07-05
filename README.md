# Miniswap

Miniature Bitswap implementation, remote read only.

## Usage

```js
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'

const miniswap = new Miniswap(blockstore)

libp2p.handle(BITSWAP_PROTOCOL, miniswap.handler)
```
