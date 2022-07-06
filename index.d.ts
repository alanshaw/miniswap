import { CID } from 'multiformats/cid'
import { StreamHandler } from '@libp2p/interfaces/registrar'

export interface Blockstore {
  get (cid: CID): Promise<Uint8Array|undefined>
  has (cid: CID): Promise<boolean>
}

export declare class Miniswap {
  constructor (blockstore: Blockstore)
  handler: StreamHandler
}

export declare const BITSWAP_PROTOCOL: string
