import { ethers } from 'ethers';
import axios from 'axios';
import { chainIDList, writeError, checkForAllowance, waitForConfirm } from '../../supportFunc.mjs'

const RFQ_PARAM_TYPES = {
    Aggregate: [
        {name: "expiry", type: "uint256"},
        {name: "taker_address", type: "address"},
        {name: "maker_addresses", type: "address[]"},
        {name: "maker_nonces", type: "uint256[]"},
        {name: "taker_tokens", type: "address[][]"},
        {name: "maker_tokens", type: "address[][]"},
        {name: "taker_amounts", type: "uint256[][]"},
        {name: "maker_amounts", type: "uint256[][]"},
        {name: "receiver", type: "address"},
        {name: "commands", type: "bytes"}
    ]
}

export async function bebopSwap(parametrs, wallet, provider) {
    const tokenAmount = parametrs.amount
    const chain = parametrs.fromChain.chainName
    const fromToken = parametrs.fromToken
    const toToken = parametrs.toToken
    const contract = parametrs.tokenContract
    const rfqApprovalAddress = '0xBeB09000fa59627dc02Bb55448AC1893EAa501A5';

    const RFQ_PARAM_DOMAIN = {
        name: "BebopSettlement",
        version: "1",
        chainId: chainIDList[chain].id,
        verifyingContract: rfqApprovalAddress,
    }

    console.log('Bebop Swap Started..')
    try {
        const wrappedAddress = chainIDList[chain].wrapped;
        const abiWrap = [
            'function deposit() public payable',
            'function withdraw(uint) public',
            'function balanceOf(address) view returns (uint)',
        ];
        const wrappedContract = new ethers.Contract(wrappedAddress, abiWrap, wallet);
        let signal = 0;
        if (fromToken == ethers.ZeroAddress) {
            if (toToken == wrappedAddress) {
                let tx = await wrappedContract.deposit({value: tokenAmount});
                console.log('Tx:', tx, '\тHash:', tx.hash, '\nWait for confirmations..');
                let confirmRes = await waitForConfirm(tx.hash, provider);
                console.log('Done!');
                return 1;
            }
            
        } else if (fromToken == wrappedAddress) {
            if (toToken == ethers.ZeroAddress) {
                let tx = await wrappedContract.withdraw(tokenAmount);
                console.log('Wait for confirmations..');
                console.log('Hash:', tx.hash, '\nWait for confirmations..');
                let confirmRes = await waitForConfirm(tx.hash, provider);
                console.log('Done!');
                return 1;
            }
        }
        if (fromToken == ethers.ZeroAddress) {
            if (await wrappedContract.balanceOf(wallet.address) >= tokenAmount) {
                console.log('Wrap is unnecessary');
            } else {
                console.log('Wrap started..');
                let tx = await wrappedContract.deposit({value: tokenAmount});
                console.log('Hash:', tx.hash, '\nWait for confirmations..');
                let confirmRes = await waitForConfirm(tx.hash, provider);
                console.log('Wrap end!');
            }
            fromToken = wrappedAddress;
        } else if (toToken == ethers.ZeroAddress) {
            toToken = chainIDList[chain].wrapped;
            signal = 1;
        }

        console.log('Checking Approve..');
        let allowanceResult = await checkForAllowance(wallet, fromToken, rfqApprovalAddress, tokenAmount, provider);
        if (allowanceResult == 0) {
            console.log('Approve failed');
            return 0;
        } else if (allowanceResult == 2) {
            return 2;
        }

        console.log('Getting quote..');
        
        let rfqQuote = (await axios.get(`https://api.bebop.xyz/${chain}/v2/quote`, {
                params: {
                    buy_tokens: String(toToken),
                    sell_tokens: String(fromToken),
                    sell_amounts: String(tokenAmount),
                    taker_address: wallet.address,
                }
            })).data;

        if (rfqQuote.hasOwnProperty('error')) {
            await writeError(rfqQuote.error.errorCode+'\n'+rfqQuote.error.message);
            return 2
        } else if (rfqQuote.hasOwnProperty('toSign')) {
            console.log('All good');
        }

        console.log('Tx signning..');
        let signature = await wallet.signTypedData(RFQ_PARAM_DOMAIN, RFQ_PARAM_TYPES, rfqQuote.toSign);
        console.log('Tx sign success!');
        let response = (await axios.post(`https://api.bebop.xyz/${chain}/v2/order`, {
            signature: signature,
            quote_id: rfqQuote.quoteId,
            }, {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                withCredentials: true
            })).data
        if (response.hasOwnProperty('error')) {
            await writeError(response.error.errorCode+'\n'+response.error.message);
            return 2;
        }
        console.log('Response done, waiting for confirmation');
        await waitForConfirm(response.txHash, provider);
        console.log(response);

        if (toToken == wrappedAddress) {
            if (signal == 1) {
                let txUnwrap = await wrappedContract.withdraw((tokenAmount)*(BigInt(10**18)/(BigInt(10)**(await contract.decimals()))));
                await waitForConfirm(txUnwrap.hash, provider);
            }
        };
        console.log('Done!');
        return 1;
    } catch(error) {
        console.log('FAIL\n', error);
        return 0;
    }
}