export async function lifiSwap(tokenAmount, fromChain, toChain, fromToken, toToken, tokenContract, wallet, provider) {
    console.log('Swapping..');

    const slippage = 0.01 //equal 1%

    const fromAmount = tokenAmount;
          
    console.log('Getting quote..');
    const getQuote = async (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, slippage) => {
        const result = await axios.get('https://li.quest/v1/quote', {
            params: {
                fromChain,
                toChain,
                fromToken,
                toToken,
                fromAmount,
                fromAddress,
                slippage,
            }
        });
        return result.data;
    }

    const approvalAddress = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';

    const quote = await getQuote(fromChain, toChain, fromToken, toToken, fromAmount, wallet.address, slippage);
    if (fromToken != ethers.ZeroAddress) {
        console.log('Checking allowance..');
        await checkForAllowance(wallet, quote.action.fromToken.address, quote.estimate.approvalAddress, fromAmount, provider);
        console.log('Allowance done!');
    }

    console.log('Sending tx..\nGas Limit:', ethers.toNumber(quote.transactionRequest.gasLimit), 'gwei', '\nGas Price:', ethers.toNumber(quote.transactionRequest.gasPrice)/10**9);
    
    try {
        const tx = await wallet.sendTransaction(quote.transactionRequest);
        console.log(tx.hash)
        await tx.wait(3);
    } catch (error) {
        await writeError(error.stack);
    }

    //console.log('Getting status..')
    /*const getStatus = async (bridge, fromChain, toChain, txHash) => {
        const result = await axios.get('https://li.quest/v1/status', {
            params: {
                bridge,
                fromChain,
                toChain,
                txHash,
            }
        });
        return result.data;
    }
    const status = await getStatus(quote.tool, fromChain, toChain, tx.hash);*/
    console.log('DONE');
}