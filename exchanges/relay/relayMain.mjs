import axios from "axios"
import { addParametrs, waitForConfirm } from "../../supportFunc.mjs"

export async function relaySwap(parametrs, wallet, provider) {
    const tokenAmount = parametrs.amount
    const fromChain = parametrs.fromChain.chaidId
    const toChain = parametrs.toChain.chaidId
    const fromToken = parametrs.fromTokenSymbol.toLowerCase()

    const bridgeParam = {
        user: wallet.address,
        originChainId: fromChain,
        destinationChainId: toChain,
        currency: fromToken,
        amount: tokenAmount.toString(),
    }
    const options = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(bridgeParam),
    }

    const postData = await axios.post('https://api.relay.link/execute/bridge', bridgeParam, options);
    const data = postData.data.steps[0].items[0].data;
    const jsonData = JSON.stringify(data);

    const encode = new TextEncoder().encode(jsonData);
    const signature = await wallet.sendTransaction(data);
    console.log(signature)
    await waitForConfirm(signature.hash, provider)
    const paramsToCheck = {
        chainId: fromChain, // fromChain id
        hash: signature.hash // tx hash
    }
    while (true) {
        console.log('Tx pending...');
        const path = addParametrs('https://api.relay.link/transactions/status', paramsToCheck);
        let chechStatus = await axios.get(path, options);
        if (chechStatus.data.status == 'success') {
            console.log('Bridge done!');
            break;
        }
    }
}