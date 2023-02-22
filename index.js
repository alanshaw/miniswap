import { pipe } from 'it-pipe'
import * as lp from 'it-length-prefixed'
import { transform, filter, consume } from 'streaming-iterables'
import { equals } from 'multiformats/hashes/digest'
import defer from 'p-defer'
import { Message, WantType, Block, BlockPresence, BlockPresenceType } from './message.js'

/** @typedef {string} PeerID */

export const BITSWAP_PROTOCOL = '/ipfs/bitswap/1.2.0'
const PROCESS_MESSAGE_CONCURRENCY = 10
const PROCESS_WANTQUEUE_CONCURRENCY = 10

export class Miniswap {
  /** @param {import('./index.d').Blockstore} blockstore */
  constructor (blockstore) {
    if (!blockstore) throw new Error('missing blockstore parameter')
    this._blockstore = blockstore
    this._handler = this._handler.bind(this)
    /** @type {Map<PeerID, WantQueue>} */
    this._wantQueues = new Map()
  }

  get handler () {
    return this._handler
  }

  /** @type {import('@libp2p/interface-registrar').StreamHandler} */
  async _handler ({ connection, stream: inStream }) {
    const newStream = () => connection.newStream(BITSWAP_PROTOCOL)
    const peer = connection.remotePeer.toString()
    const queue = this._wantQueues.get(peer) ?? new WantQueue(this._blockstore, newStream)
    this._wantQueues.set(peer, queue)

    try {
      await pipe(
        inStream,
        lp.decode(),
        transform(PROCESS_MESSAGE_CONCURRENCY, async data => {
          const message = Message.decode(data.subarray())
          queue.newStream = newStream // create new streams on the most recent connection
          queue.append(message.wantlist.entries)
          queue.process()
        }),
        consume
      )
      inStream.close()
    } catch (err) {
      console.error(`${connection.remotePeer}: stream error`, err)
      queue.abort()
      this._wantQueues.delete(peer)
    }
  }
}

/**
 * @typedef {{ entry: import('./message').Entry, controller: AbortController, deferred: import('p-defer').DeferredPromise }} WantItem
 * @typedef {{ entry: import('./message').Entry, signal: AbortSignal }} WantWork
 */

class WantQueue {
  /**
   * @param {import('./index.d').Blockstore} blockstore
   * @param {() => Promise<import('@libp2p/interface-connection').Stream>} newStream
   */
  constructor (blockstore, newStream) {
    this._blockstore = blockstore
    this.newStream = newStream
    /** @type {WantItem[]} */
    this._processing = []
    /** @type {WantItem[]} */
    this._pending = []
  }

  /** @param {import('./message').Entry[]} entries */
  append (entries) {
    const promises = []
    for (const entry of entries) {
      if (entry.cancel) {
        this._pending.forEach(item => { if (equalEntry(item.entry, entry)) item.controller.abort() })
        this._processing.forEach(item => { if (equalEntry(item.entry, entry)) item.controller.abort() })
      } else {
        const deferred = defer()
        const controller = new AbortController()
        this._pending.push({ entry, controller, deferred })
        promises.push(deferred.promise)
      }
    }
    return Promise.all(promises)
  }

  async process () {
    const self = this
    if (self._running) return
    self._running = true
    const outStream = await self.newStream()
    try {
      await pipe(
        (async function * () {
          while (true) {
            const item = self._pending.shift()
            if (!item) return
            self._processing.push(item)
            yield { entry: item.entry, signal: item.controller.signal }
          }
        })(),
        processWantQueue(self._blockstore),
        async function * (source) {
          for await (const message of source) {
            self._processing = self._processing.filter()
            yield message.encode()
          }
        },
        lp.encode(),
        outStream
      )
    } catch (err) {
      this._pending = []
      this._processing = []
    } finally {
      outStream.close()
      this._running = false
    }
  }
}

/**
 * @param {import('./message').Entry} a 
 * @param {import('./message').Entry} b 
 */
function equalEntry (a, b) {
  return a.wantType === b.wantType && equals(a.cid.multihash, b.cid.multihash)
}

/**
 * Process a wantlist and yield encoded bitswap messages in response to the
 * wants in the wantlist.
 *
 * @param {import('./index.d').Blockstore} blockstore
 * @returns {import('it-pipe').Transform<WantWork, Message>}
 */
function processWantQueue (blockstore) {
  return queue => {
    return pipe(
      queue,
      transform(PROCESS_WANTQUEUE_CONCURRENCY, async ({ entry, signal }) => {
        try {
          if (entry.wantType === WantType.Block) {
            const raw = await blockstore.get(entry.cid, { signal })
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
        } catch (err) {
          if (signal.aborted) return null
          throw err
        }
      }),
      filter(d => d != null), // filter aborted blocks
      async function * (source) {
        let message = new Message()
        for await (const blockOrPresence of source) {
          if (blockOrPresence instanceof Block) {
            if (!message.addBlock(blockOrPresence)) {
              yield message
              message = new Message({ blocks: [blockOrPresence] })
            }
          } else if (blockOrPresence instanceof BlockPresence) {
            if (!message.addBlockPresence(blockOrPresence)) {
              yield message
              message = new Message({ blockPresences: [blockOrPresence] })
            }
          }
        }
        if (message.blocks.length || message.blockPresences.length) {
          yield message
        }
      }
    )
  }
}
