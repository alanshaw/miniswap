import { UnknownLink } from 'multiformats/link'
import { StreamHandler } from '@libp2p/interface'

export interface Blockstore {
  get (cid: UnknownLink): Promise<Uint8Array|undefined>
  has (cid: UnknownLink): Promise<boolean>
}

export declare class Miniswap {
  constructor (blockstore: Blockstore)
  handler: StreamHandler
}

export declare const BITSWAP_PROTOCOL: string
