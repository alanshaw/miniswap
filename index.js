import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { transform, consume } from 'streaming-iterables'
import { Message, WantType, Block, BlockPresence, BlockPresenceType } from './message.js'

export const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'
const PROCESS_MESSAGE_CONCURRENCY = 10
const PROCESS_WANTLIST_CONCURRENCY = 10

export class Miniswap {
  /** @param {import('./index.d').Blockstore} blockstore */
  constructor (blockstore) {
    if (!blockstore) throw new Error('missing blockstore parameter')
    this._blockstore = blockstore
    this._handler = this._handler.bind(this)
  }

  get handler () {
    return this._handler
  }

  /** @type {import('@libp2p/interface').StreamHandler} */
  async _handler ({ connection, stream: inStream }) {
    try {
      await pipe(
        inStream,
        lp.decode,
        transform(PROCESS_MESSAGE_CONCURRENCY, async data => {
          const message = Message.decode(data.subarray())
          const outStream = await connection.newStream(BITSWAP_PROTOCOL)
          const bs = this._blockstore
          await pipe(processWantlist(bs, message.wantlist), lp.encode, outStream)
          await outStream.close()
        }),
        consume
      )
      await inStream.close()
    } catch (err) {
      console.error(`${connection.remotePeer}: stream error`, err)
    }
  }
}

/**
 * Process a wantlist and yield encoded bitswap messages in response to the
 * wants in the wantlist.
 *
 * @param {import('./index.d').Blockstore} blockstore
 * @param {import('./message').Wantlist} wantlist
 */
function processWantlist (blockstore, wantlist) {
  return pipe(
    wantlist.entries.filter(entry => !entry.cancel),
    transform(PROCESS_WANTLIST_CONCURRENCY, async (/** @type {import('./message').Entry} */ entry) => {
      if (entry.wantType === WantType.Block) {
        const raw = await blockstore.get(entry.cid)
        if (raw) {
          return new Block(entry.cid, raw)
        } else if (entry.sendDontHave) {
          return new BlockPresence(entry.cid, BlockPresenceType.DontHave)
        }
      } else if (entry.wantType === WantType.Have) {
        const exists = await blockstore.has(entry.cid)
        const type = exists ? BlockPresenceType.Have : BlockPresenceType.DontHave
        return new BlockPresence(entry.cid, type)
      }
    }),
    async function * (source) {
      let message = new Message()
      for await (const blockOrPresence of source) {
        if (blockOrPresence instanceof Block) {
          if (!message.addBlock(blockOrPresence)) {
            yield message.encode()
            message = new Message({ blocks: [blockOrPresence] })
          }
        } else if (blockOrPresence instanceof BlockPresence) {
          if (!message.addBlockPresence(blockOrPresence)) {
            yield message.encode()
            message = new Message({ blockPresences: [blockOrPresence] })
          }
        }
      }
      if (message.blocks.length || message.blockPresences.length) {
        yield message.encode()
      }
    }
  )
}
