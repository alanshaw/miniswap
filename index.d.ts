import { UnknownLink } from 'multiformats/Link'
import { StreamHandler } from '@libp2p/interface-registrar'

export interface Abortable {
  signal?: AbortSignal
}

export interface Blockstore {
  get (cid: UnknownLink, options?: Abortable): Promise<Uint8Array|undefined>
  has (cid: UnknownLink, options?: Abortable): Promise<boolean>
}

export declare class Miniswap {
  constructor (blockstore: Blockstore)
  handler: StreamHandler
}

export declare const BITSWAP_PROTOCOL: string
