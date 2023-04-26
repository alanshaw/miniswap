import test from 'ava'
import { fromString } from 'multiformats/bytes'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import * as Prefix from './prefix.js'

test('should round trip a prefix', async t => {
  const { cid } = await Block.encode({ value: fromString('somedata'), codec: raw, hasher: sha256 })
  const bytes = Prefix.encode(cid)
  const prefix = Prefix.decode(bytes)
  t.is(prefix.version, cid.version)
  t.is(prefix.code, cid.code)
  t.is(prefix.multihash.code, cid.multihash.code)
  t.is(prefix.multihash.size, cid.multihash.size)
})
