import test from 'ava'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { createBitswap } from 'ipfs-bitswap'
import { MemoryBlockstore } from 'blockstore-core/memory'
import { fromString, toString } from 'uint8arrays'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import { multiaddr } from '@multiformats/multiaddr'
import { Miniswap, BITSWAP_PROTOCOL } from './index.js'

test('should bitswap a single CID', async t => {
  const clientBlockstore = new MemoryBlockstore()
  const client = await createLibp2p({
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const bitswap = createBitswap(client, clientBlockstore)
  console.log('starting client')
  await client.start()

  // create blockstore and add data
  const serverBlockstore = new MemoryBlockstore()
  const data = fromString(`TEST DATA ${Date.now()}`)
  const hash = await sha256.digest(data)
  const cid = CID.create(1, raw.code, hash)
  await serverBlockstore.put(cid, data)

  const serverAddr = '/ip4/127.0.0.1/tcp/1337/ws'
  const server = await createLibp2p({
    addresses: { listen: [serverAddr] },
    transports: [webSockets()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()]
  })

  const miniswap = new Miniswap(serverBlockstore)
  server.handle(BITSWAP_PROTOCOL, miniswap.handler)

  console.log('starting server')
  await server.start()

  console.log(`dialing ${serverAddr}/p2p/${server.peerId}`)
  await client.dial(multiaddr(`${serverAddr}/p2p/${server.peerId}`))

  console.log('starting bitswap')
  bitswap.start()

  console.log(`bitswapping ${cid}`)
  const retrievedData = await bitswap.get(cid)

  t.is(toString(retrievedData), toString(data))
})
