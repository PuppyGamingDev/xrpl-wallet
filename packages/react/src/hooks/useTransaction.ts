import { walletClientContext } from '../context'

import { useContext } from "react"

const useTransaction = () => {
  const { walletClient } = useContext(walletClientContext)
  if (!walletClient) return null
  const { signAndSubmit, sign, autofill, getAccountSequence, getAddress, getFee, getLedgerSequece } = walletClient
  return { signAndSubmit, sign, autofill, getAccountSequence, getAddress, getFee, getLedgerSequece }
}

export default useTransaction
