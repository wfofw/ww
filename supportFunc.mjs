import { ethers } from 'ethers';
import lodash from 'lodash';
import { round } from 'mathjs';

export async function getNativeTokenBalance(tokenContract, tokenAddress, provider, address) {
    if (tokenAddress == ethers.ZeroAddress) {
        const balance = await provider.getBalance(address);
        //console.log(balance);
        return BigInt(balance);
    } else {
        const balance = await tokenContract.balanceOf(address);
        //console.log(tokenAddress,' has ', balance);
        return BigInt(balance);
    }
}

export async function makeAmount(balance) {
    const percentage = round(lodash.random(0.02, 0.99), 2);
    return BigInt(lodash.floor(balance*percentage));
}