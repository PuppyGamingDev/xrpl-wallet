import { AnyJson, XrplClient } from 'xrpl-client'
import { EVENTS, Network, SignOption, TxJson, WalletAdaptor } from "./WalletAdaptor"
import { networkEndpoints } from './networks'

export class WalletClient<T extends WalletAdaptor = WalletAdaptor> {
  walletName: string
  // @ts-ignore
  xrplClient: XrplClient
  private network: Network

  constructor(private readonly adaptor: T, network: Network = { server: 'mainnet' }) {
    this.walletName = adaptor.name
    this.network = network
    this.changeNetwork(network)
    this.adaptor.on(EVENTS.NETWORK_CHANGED, (network: Network) => {
      this.changeNetwork(network)
    })
  }

  // events
  onAccountChange = (listener: (address: string | null) => void) => {
    this.adaptor.on(EVENTS.ACCOUNT_CHANGED, listener)
    return () => {
      this.adaptor.off(EVENTS.ACCOUNT_CHANGED, listener)
    }
  }
  
  onNetworkChange = (listener: (network: Network) => void) => {
    this.adaptor.on(EVENTS.NETWORK_CHANGED, listener)
    return () => {
      this.adaptor.off(EVENTS.NETWORK_CHANGED, listener)
    }
  }
  
  onConnected = (listener: () => void) => {
    this.adaptor.on(EVENTS.CONNECTED, listener)
    return () => {
      this.adaptor.off(EVENTS.CONNECTED, listener)
    }
 }
  
  onDisconnected = (listener: () => void) => {
    this.adaptor.on(EVENTS.DISCONNECTED, listener)
    return () => {
      this.adaptor.off(EVENTS.DISCONNECTED, listener)
    }
  }
  
  isConnected = async () => {
    return await this.adaptor.isConnected()
  }

  /**
   * Connect to Wallet
   */
  signIn = async () => {
    return await this.adaptor.signIn()
  }
  
  /**
   * Disconnect from Wallet
   */
  signOut = async () => {
    return await this.adaptor.signOut()
  }

  /**
   * Get Wallet Address
   */
  getAddress = async () => {
    return await this.adaptor.getAddress()
  }

  /**
   * Get Network wallet connected
   */
  getNetwork = async () => {
    const network = await this.adaptor.getNetwork()
    if (network) {
      this.network = network
      this.changeNetwork(network)
    } else {
      // TODO: throw error
    }
    return network
  }

  /**
   * Sign Transaction
   * option: autofill (default: true)
   */
  sign = async (txjson: TxJson, option?: SignOption) => {
    if (!txjson.LastLedgerSequence) {
      throw new Error('Transaction must contain a LastLedgerSequence value for reliable submission.',)
    }
    return await this.adaptor.sign(txjson, option)
  }

  /**
   * Sign and Submit Transaction
   * option: autofill (default: true)
   */
  signAndSubmit = async (txjson: TxJson, option?: SignOption) => {
    return await this.adaptor.signAndSubmit(txjson, option)
  }

  /**
   * Submit Transaction(and Walt for validated)
   */
  submit = async (txblob: string) => {
    const submitResult = await this.xrplClient.send({ command: 'submit', tx_blob: txblob })
    if (submitResult.error) {
      throw new Error(`${submitResult.error} : ${submitResult.error_exception}`)
    }
    const hash = submitResult.tx_json.hash
    const LastLedgerSequence = submitResult.tx_json.LastLedgerSequence
    const txResponse = await new Promise<AnyJson>((resolve, reject) => {
      this.xrplClient.on('ledger', async (event) => {
        const ledger_index = event.ledger_index
        const txResponse = await this.xrplClient.send({ command: 'tx', transaction: hash })
        if (!txResponse.error) {
          resolve(txResponse)
        } else if (ledger_index > LastLedgerSequence) {
          reject(`The latest ledger sequence ${ledger_index} is greater than the transaction's LastLedgerSequence (${LastLedgerSequence}).\n` +
            `Preliminary result: ${submitResult.engine_result}`)
        }
      })
    })
    return txResponse
  }

  autofill = async (txjson: TxJson) => {
    if (!txjson.Account) {
      txjson.Account = await this.getAddress()
    }
    if (!txjson.Sequence) {
      txjson.Sequence = await this.getAccountSequence()
    }
    if(!txjson.LastLedgerSequence) {
      txjson.LastLedgerSequence = await this.getLedgerSequece()
    }
    if(!txjson.Fee) {
      txjson.Fee = await this.getFee()
    }
    // TODO: NetworkID
    return txjson
  }
  
  getAccountSequence = async () => {
    const result = await this.xrplClient.send({ command: 'account_info', account: await this.getAddress() })
    return result.account_data.Sequence as number
  }
  
  getLedgerSequece = async (offset: number = 20) => {
    const result = await this.xrplClient.send({ command: 'ledger', ledger_index: 'validated' })
    return (result.ledger_index as number) + offset
  }
  
  getFee = async () => {
    const result = await this.xrplClient.send({ command: 'fee' })
    return result.drops.base_fee as string
  }
  
  // --- private ---
  /**
   * Change Network
   */
  private changeNetwork = (network: Network) => {
    if (typeof network.server === 'string' && networkEndpoints.hasOwnProperty(network.server)) {
      // @ts-ignore 
      this.xrplClient = new XrplClient(networkEndpoints[network.server])
    } else {
      this.xrplClient = new XrplClient(network.server)
    }
  }
}
