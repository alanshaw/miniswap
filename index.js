import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { transform } from 'streaming-iterables'
import { Message } from './message.js'

/**
 * @typedef {import('multiformats').CID} CID
 */

export const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'

export class Miniswap {
  /**
   * @param {{ get (cid: CID): Promise<Block|undefined>, has (cid: CID): Promise<boolean> }} blockstore
   */
  constructor (blockstore) {
    this._blockstore = blockstore
    this._handler = this._handler.bind(this)
  }

  get handler () {
    return this._handler
  }

  /** @type {import('@libp2p/interfaces/registrar').StreamHandler} */
  async _handler ({ connection, stream: inStream }) {
    try {
      await pipe(
        inStream,
        lp.decode(),
        async source => {
          for await (const data of source) {
            const message = Message.decode(data)
            const { stream: outStream } = await connection.newStream(BITSWAP_PROTOCOL)
            await pipe(
              this._processWantlist(message),
              lp.encode(),
              outStream
            )
          }
        }
      )
    } catch (err) {
      console.error(`${connection.remotePeer}: stream error`, err)
    }
  }

  /** @param {Wantlist} wantlist */
  _processWantlist (wantlist) {
    return pipe(
      wantlist.entries.filter(e => !e.cancel),
      transform(5, async entry => {
        if (entry.wantType === Entry.WantType.Block) {
          const raw = await this._blockstore.get(entry.cid)
          if (raw) {
            return new Block(entry.cid, raw)
          } else if (entry.sendDontHave) {
            return new BlockPresence(entry.cid, BlockPresence.Type.DontHave)
          }
        } else if (entry.wantType === Entry.WantType.Have) {
          const exists = await this._blockstore.has(entry.cid)
          const type = exists ? BlockPresence.Type.Have : BlockPresence.Type.DontHave
          return new BlockPresence(entry.cid, type)
        }
      }),
      async function * (source) {
        let message = new Message()
        for await (const blockOrPresence of source) {
          if (blockOrPresence instanceof Block) {
            if (!message.addBlock(blockOrPresence)) {
              yield message.encode()
              message = new Message()
              message.addBlock(blockOrPresence)
            }
          } else if (blockOrPresence instanceof BlockPresence) {
            if (!message.addBlockPresence(blockOrPresence)) {
              yield message.encode()
              message = new Message()
              message.addBlockPresence(blockOrPresence)
            }
          }
        }
        if (message.blocks.length || message.blocksPresences.length) {
          yield message.encode()
        }
      }
    )
  }
}
